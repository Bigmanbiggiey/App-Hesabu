"""Reusable view decorators."""
import ipaddress
import logging
from functools import wraps

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def _client_ip(request) -> str:
    """
    Best-effort client IP.

    Behind nginx ``REMOTE_ADDR`` is the proxy, so when
    ``DARAJA_TRUST_FORWARDED_FOR`` is set we take the last hop from
    ``X-Forwarded-For`` (the entry the trusted proxy appended).
    """
    if getattr(settings, "DARAJA_TRUST_FORWARDED_FOR", False):
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            return xff.split(",")[-1].strip()
    return request.META.get("REMOTE_ADDR", "")


def _load_networks(entries):
    networks = []
    for entry in entries:
        try:
            networks.append(ipaddress.ip_network(str(entry).strip(), strict=False))
        except ValueError:
            logger.error("Ignoring invalid DARAJA_ALLOWED_IPS entry: %r", entry)
    return networks


def daraja_ip_allowlist(view_func):
    """
    Restrict a (necessarily unauthenticated) M-Pesa callback endpoint to
    Safaricom's published source IPs, configured via ``DARAJA_ALLOWED_IPS``
    (list of IPs or CIDRs).

    If the setting is empty the check is disabled (and logged loudly) so
    local/sandbox testing keeps working — production MUST populate it, and
    an edge rule (e.g. a Cloudflare WAF rule on the callback paths) can
    enforce the same set as defence in depth.
    """
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        raw = getattr(settings, "DARAJA_ALLOWED_IPS", None) or []
        if not raw:
            logger.warning(
                "DARAJA_ALLOWED_IPS is empty — M-Pesa callback IP allowlist is "
                "DISABLED. Populate it in production."
            )
            return view_func(request, *args, **kwargs)

        networks = _load_networks(raw)
        client_ip = _client_ip(request)
        try:
            ip = ipaddress.ip_address(client_ip)
        except ValueError:
            ip = None

        if ip is None or not any(ip in net for net in networks):
            logger.warning(
                "Rejected M-Pesa callback to %s from disallowed IP %r",
                request.path,
                client_ip,
            )
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        return view_func(request, *args, **kwargs)

    return _wrapped

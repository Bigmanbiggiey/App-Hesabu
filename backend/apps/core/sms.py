"""
Africa's Talking SMS utility.

Usage:
    from apps.core.sms import send_sms
    send_sms("+254712345678", "Your invoice INV-00001 has been paid.")

Silently logs and returns False if AT_API_KEY is not configured or the call fails,
so callers don't need try/except.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_sms(phone: str, message: str) -> bool:
    """
    Send an SMS via Africa's Talking. Returns True on success, False on failure.
    Phone number must be in international format e.g. +254712345678.
    """
    api_key = getattr(settings, "AT_API_KEY", "")
    username = getattr(settings, "AT_USERNAME", "sandbox")
    sender_id = getattr(settings, "AT_SENDER_ID", "HESABU")

    if not api_key:
        logger.debug("AT_API_KEY not configured — skipping SMS to %s", phone)
        return False

    try:
        import africastalking
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS
        response = sms.send(message, [phone], sender_id=sender_id)
        recipients = response.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("status") == "Success":
            logger.info("SMS sent to %s: %s", phone, recipients[0].get("messageId"))
            return True
        else:
            logger.warning("AT SMS failed for %s: %s", phone, response)
            return False
    except Exception as exc:
        logger.error("AT SMS error for %s: %s", phone, exc)
        return False

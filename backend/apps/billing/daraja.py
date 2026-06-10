"""
Daraja STK Push client for Hesabu subscription billing.

Flow:
1. Call stk_push() → Safaricom sends a PIN prompt to the customer's phone
2. Daraja POSTs the result to DARAJA_STK_CALLBACK_URL (/api/v1/billing/mpesa/callback/)
3. The callback view looks up the BillingTransaction by mpesa_checkout_request_id
   and activates the subscription on success.
"""
import base64
import logging
from datetime import datetime

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str) -> str:
    """Convert any Kenyan phone format to 254XXXXXXXXX."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+254"):
        phone = "254" + phone[4:]
    elif phone.startswith("0"):
        phone = "254" + phone[1:]
    elif not phone.startswith("254"):
        phone = "254" + phone
    return phone


class DarajaSTKClient:
    def __init__(self):
        self.base_url        = settings.DARAJA_BASE_URL.rstrip("/")
        self.consumer_key    = settings.DARAJA_CONSUMER_KEY
        self.consumer_secret = settings.DARAJA_CONSUMER_SECRET
        self.shortcode       = settings.DARAJA_SHORTCODE
        self.passkey         = settings.DARAJA_PASSKEY
        self.callback_url    = settings.DARAJA_STK_CALLBACK_URL

    def get_access_token(self) -> str:
        credentials = base64.b64encode(
            f"{self.consumer_key}:{self.consumer_secret}".encode()
        ).decode()
        resp = requests.get(
            f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def stk_push(self, phone: str, amount: int, account_ref: str) -> dict:
        """
        Initiate an STK Push request.

        Returns the full Daraja response dict which includes:
          - CheckoutRequestID (use for callback matching)
          - ResponseCode ("0" = accepted, anything else = error)
          - ResponseDescription
        Raises requests.HTTPError on network / API errors.
        """
        token     = self.get_access_token()
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password  = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password":          password,
            "Timestamp":         timestamp,
            "TransactionType":   "CustomerPayBillOnline",
            "Amount":            amount,
            "PartyA":            _normalize_phone(phone),
            "PartyB":            self.shortcode,
            "PhoneNumber":       _normalize_phone(phone),
            "CallBackURL":       self.callback_url,
            "AccountReference":  account_ref[:12],   # Daraja max 12 chars
            "TransactionDesc":   f"Hesabu {account_ref} subscription",
        }

        resp = requests.post(
            f"{self.base_url}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"STK Push initiated: {data.get('CheckoutRequestID')} for {phone}")
        return data

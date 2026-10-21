import base64

from cryptography.hazmat.primitives import serialization
from django.core.management.base import BaseCommand
from py_vapid import Vapid02


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = (
        "Generate a VAPID key pair for Web Push, printed as .env lines. Append "
        "straight to the env file (`... generate_vapid_keys >> .env`) so the "
        "private key never lands on screen."
    )

    def handle(self, *args, **options):
        vapid = Vapid02()
        vapid.generate_keys()
        public = vapid.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        self.stdout.write(f"VAPID_PUBLIC_KEY={_b64url(public)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={_b64url(private)}")

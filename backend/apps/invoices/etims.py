"""
KRA eTIMS API integration service.

KRA eTIMS API Docs reference: https://etims-sbx.kra.go.ke/etims-api
Sandbox base URL: https://etims-sbx.kra.go.ke/etims-api
"""
import logging
from decimal import Decimal
from django.conf import settings
import requests

logger = logging.getLogger(__name__)


class EtimsError(Exception):
    pass


class EtimsRejected(EtimsError):
    """KRA processed the submission and refused it (non-"000" resultCd).
    Unlike timeouts/network errors, retrying the same payload won't help."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"KRA rejected submission. Code: {code} — {message}")


class EtimsService:
    def __init__(self, organization):
        self.organization = organization
        self.base_url = settings.ETIMS_BASE_URL
        self.pin = organization.kra_pin
        self.branch_id = organization.etims_branch_id or "00"

    def _get_headers(self):
        return {
            "Content-Type": "application/json",
            "tin": self.pin,
            "bhfId": self.branch_id,
        }

    def _post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.base_url}/{endpoint}"
        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._get_headers(),
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            result_code = data.get("resultCd", "")
            if result_code != "000":
                raise EtimsRejected(result_code, data.get("resultMsg", ""))
            return data.get("data", {})
        except requests.Timeout:
            raise EtimsError("KRA eTIMS API request timed out.")
        except requests.RequestException as e:
            raise EtimsError(f"Network error communicating with KRA: {e}")

    def submit_invoice(self, invoice) -> dict:
        """Build the eTIMS Sales Transaction payload and submit."""
        payload = self._build_sales_payload(invoice)
        logger.info(f"Submitting invoice {invoice.invoice_number} to eTIMS.")
        return self._post("trnsSalesOsdc", payload)

    def _build_sales_payload(self, invoice) -> dict:
        items = []
        for idx, item in enumerate(invoice.line_items.all(), start=1):
            items.append({
                "itemSeq": idx,
                "itemNm": item.description[:100],
                "itemClsCd": item.commodity_code or "5020230602",  # default misc goods
                "qty": float(item.quantity),
                "prc": float(item.unit_price),
                "splyAmt": float(item.line_total),
                "dcRt": 0,
                "dcAmt": 0,
                "taxTyCd": self._get_tax_type_code(item.vat_class),
                "taxblAmt": float(item.line_total),
                "taxAmt": float(item.vat_amount),
                "totAmt": float(item.line_total + item.vat_amount),
            })

        return {
            "invcNo": invoice.invoice_number,
            "orgInvcNo": 0,
            "custTin": invoice.customer.kra_pin or None,
            "custNm": invoice.customer.name,
            "salesTyCd": "N",
            "rcptTyCd": "S",
            "pmtTyCd": "01",  # credit
            "salesSttsCd": "02",
            "cfmDt": invoice.invoice_date.strftime("%Y%m%d%H%M%S"),
            "salesDt": invoice.invoice_date.strftime("%Y%m%d"),
            "stockRlsDt": None,
            "cnclReqDt": None,
            "cnclDt": None,
            "rfdDt": None,
            "rfdRsnCd": None,
            "totItemCnt": len(items),
            "taxblAmtA": float(invoice.subtotal),
            "taxblAmtB": 0,
            "taxblAmtC": 0,
            "taxblAmtD": 0,
            "taxblAmtE": 0,
            "taxRtA": 16,
            "taxRtB": 0,
            "taxRtC": 0,
            "taxRtD": 0,
            "taxRtE": 0,
            "taxAmtA": float(invoice.vat_amount),
            "taxAmtB": 0,
            "taxAmtC": 0,
            "taxAmtD": 0,
            "taxAmtE": 0,
            "totTaxblAmt": float(invoice.subtotal),
            "totTaxAmt": float(invoice.vat_amount),
            "totAmt": float(invoice.total_amount),
            "remark": invoice.notes or "",
            "itemList": items,
        }

    @staticmethod
    def _get_tax_type_code(vat_class: str) -> str:
        mapping = {
            "standard": "A",
            "zero_rated": "B",
            "exempt": "E",
        }
        return mapping.get(vat_class, "A")

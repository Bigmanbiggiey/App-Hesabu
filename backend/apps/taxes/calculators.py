"""
Kenyan payroll calculators — 2026 rates.

Deductions applied in this order:
  1. NSSF         — 6 % of gross (capped at KES 18,000); reduces taxable income
  2. PAYE         — applied to (gross − NSSF); personal relief of KES 2,400/mo subtracted
  3. NHIF         — income-based bands; does NOT reduce taxable income
  4. Housing Levy — 1.5 % of gross (Affordable Housing Levy Act, permanent from 2024);
                    does NOT reduce taxable income

Net pay = Gross − NSSF − PAYE − NHIF − Housing Levy
"""
from decimal import Decimal, ROUND_HALF_UP


# ── KRA PAYE Tax Bands (2023 → current) ──────────────────────────────────────
# Monthly taxable income bands and their marginal rates, in KES
PAYE_BANDS = [
    (Decimal("24000"),   Decimal("0.10")),
    (Decimal("8333"),    Decimal("0.25")),
    (Decimal("467667"),  Decimal("0.30")),
    (None,               Decimal("0.35")),  # None = no upper limit
]

PERSONAL_RELIEF  = Decimal("2400")   # KES per month
HOUSING_LEVY_RATE = Decimal("0.015")  # 1.5 % of gross


# ── Internal helper ───────────────────────────────────────────────────────────

def _band_tax(taxable_income: Decimal) -> Decimal:
    """Compute gross PAYE from the band table, BEFORE subtracting personal relief."""
    tax = Decimal("0")
    remaining = taxable_income
    for band_size, rate in PAYE_BANDS:
        if remaining <= 0:
            break
        taxable_in_band = remaining if band_size is None else min(remaining, band_size)
        tax += taxable_in_band * rate
        remaining -= taxable_in_band
    return tax.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── Public calculators ────────────────────────────────────────────────────────

def calculate_paye(taxable_income: Decimal) -> Decimal:
    """
    Net PAYE payable after personal relief (KES 2,400/month).
    Returns zero if gross tax does not exceed the personal relief amount.
    """
    gross_tax = _band_tax(taxable_income)
    return max(Decimal("0"), gross_tax - PERSONAL_RELIEF).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def calculate_nhif(gross_salary: Decimal) -> Decimal:
    """
    NHIF contributions — income-based bands.
    Note: NHIF is being transitioned to SHIF (Social Health Insurance Fund)
    under the Social Health Authority. These bands remain in use until the
    full SHIF rollout is confirmed by regulation.
    """
    bands = [
        (Decimal("5999"),  Decimal("150")),
        (Decimal("7999"),  Decimal("300")),
        (Decimal("11999"), Decimal("400")),
        (Decimal("14999"), Decimal("500")),
        (Decimal("19999"), Decimal("600")),
        (Decimal("24999"), Decimal("750")),
        (Decimal("29999"), Decimal("850")),
        (Decimal("34999"), Decimal("900")),
        (Decimal("39999"), Decimal("950")),
        (Decimal("44999"), Decimal("1000")),
        (Decimal("49999"), Decimal("1100")),
        (Decimal("59999"), Decimal("1200")),
        (Decimal("69999"), Decimal("1300")),
        (Decimal("79999"), Decimal("1400")),
        (Decimal("89999"), Decimal("1500")),
        (Decimal("99999"), Decimal("1600")),
        (None,             Decimal("1700")),
    ]
    for upper, contribution in bands:
        if upper is None or gross_salary <= upper:
            return contribution
    return Decimal("1700")


def calculate_nssf(gross_salary: Decimal) -> Decimal:
    """
    NSSF contributions — NSSF Act 2013 (Tier I + II).
    Employee rate: 6 % of gross, lower floor KES 6,000, upper cap KES 18,000.
    Employer contributes a matching 6 %.
    """
    lower_limit = Decimal("6000")
    upper_limit = Decimal("18000")
    base = max(lower_limit, min(gross_salary, upper_limit))
    return (base * Decimal("0.06")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_housing_levy(gross_salary: Decimal) -> Decimal:
    """
    Affordable Housing Levy (AHL) — 1.5 % of gross salary.
    Employee deduction; employer contributes a matching 1.5 %.
    Permanent fixture from March 2024 (Kenya Supreme Court ruling upheld).
    Does NOT reduce taxable income for PAYE purposes.
    """
    return (gross_salary * HOUSING_LEVY_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_full_payroll(gross_salary: Decimal) -> dict:
    """
    Return the complete payroll breakdown for a given gross monthly salary.

    Keys returned:
      gross_salary      — input
      nssf_deduction    — employee NSSF contribution (reduces taxable income)
      taxable_income    — gross − NSSF
      gross_paye        — PAYE from band table, before personal relief
      personal_relief   — fixed KES 2,400/month
      paye_deducted     — net PAYE after personal relief (≥ 0)
      nhif_deduction    — NHIF/SHIF contribution
      housing_levy      — 1.5 % Affordable Housing Levy
      net_pay           — take-home after all deductions
    """
    nssf           = calculate_nssf(gross_salary)
    taxable_income = gross_salary - nssf
    gross_paye     = _band_tax(taxable_income)
    paye           = max(Decimal("0"), gross_paye - PERSONAL_RELIEF).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                     )
    nhif           = calculate_nhif(gross_salary)
    housing_levy   = calculate_housing_levy(gross_salary)
    net_pay        = gross_salary - nssf - paye - nhif - housing_levy

    return {
        "gross_salary":    gross_salary,
        "nssf_deduction":  nssf,
        "taxable_income":  taxable_income,
        "gross_paye":      gross_paye,
        "personal_relief": PERSONAL_RELIEF,
        "paye_deducted":   paye,
        "nhif_deduction":  nhif,
        "housing_levy":    housing_levy,
        "net_pay":         net_pay,
    }

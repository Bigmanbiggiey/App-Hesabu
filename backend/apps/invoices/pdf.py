"""Invoice PDF generation using ReportLab."""
import io
import qrcode
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
)


BRAND_GREEN = colors.HexColor("#16a34a")
LIGHT_GRAY = colors.HexColor("#f3f4f6")
DARK_GRAY = colors.HexColor("#374151")


def generate_invoice_pdf(invoice):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    header_data = [
        [
            Paragraph(f"<b>{invoice.organization.name}</b>", styles["Heading2"]),
            Paragraph(f"<b>INVOICE</b>", ParagraphStyle("right", parent=styles["Heading1"], alignment=2)),
        ]
    ]
    header_table = Table(header_data, colWidths=[95*mm, 95*mm])
    story.append(header_table)
    story.append(Spacer(1, 5*mm))

    # Organization + Invoice info
    org = invoice.organization
    info_data = [
        [
            Paragraph(f"KRA PIN: {org.kra_pin}<br/>{org.address}<br/>{org.phone}", styles["Normal"]),
            Paragraph(
                f"Invoice No: <b>{invoice.invoice_number}</b><br/>"
                f"Date: {invoice.invoice_date.strftime('%d %b %Y')}<br/>"
                f"Due: {invoice.due_date.strftime('%d %b %Y')}",
                styles["Normal"],
            ),
        ]
    ]
    info_table = Table(info_data, colWidths=[95*mm, 95*mm])
    story.append(info_table)
    story.append(Spacer(1, 5*mm))

    # Bill To
    story.append(Paragraph(f"<b>Bill To:</b> {invoice.customer.name}", styles["Normal"]))
    if invoice.customer.kra_pin:
        story.append(Paragraph(f"KRA PIN: {invoice.customer.kra_pin}", styles["Normal"]))
    story.append(Spacer(1, 5*mm))

    # Line Items
    col_headers = ["#", "Description", "Qty", "Unit Price", "VAT", "Amount"]
    table_data = [col_headers]
    for i, item in enumerate(invoice.line_items.all(), start=1):
        table_data.append([
            str(i),
            item.description,
            f"{item.quantity:,.2f}",
            f"KES {item.unit_price:,.2f}",
            f"{item.vat_class.replace('_', ' ').title()}",
            f"KES {item.line_total:,.2f}",
        ])

    items_table = Table(
        table_data,
        colWidths=[10*mm, 65*mm, 20*mm, 25*mm, 22*mm, 28*mm],
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 5*mm))

    # Totals
    totals_data = [
        ["", "Subtotal:", f"KES {invoice.subtotal:,.2f}"],
        ["", "VAT (16%):", f"KES {invoice.vat_amount:,.2f}"],
    ]
    if invoice.wht_amount:
        totals_data.append(["", "WHT Deducted:", f"(KES {invoice.wht_amount:,.2f})"])
    totals_data.append(["", "TOTAL DUE:", f"KES {invoice.total_amount:,.2f}"])

    totals_table = Table(totals_data, colWidths=[100*mm, 40*mm, 50*mm])
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (1, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (1, -1), (-1, -1), 1, BRAND_GREEN),
    ]))
    story.append(totals_table)

    # eTIMS QR Code
    if invoice.etims_qr_code:
        story.append(Spacer(1, 8*mm))
        qr = qrcode.make(invoice.etims_qr_code)
        qr_buffer = io.BytesIO()
        qr.save(qr_buffer, format="PNG")
        qr_buffer.seek(0)
        story.append(Paragraph("<b>KRA eTIMS Verification</b>", styles["Normal"]))
        story.append(Image(qr_buffer, width=30*mm, height=30*mm))
        story.append(Paragraph(f"SCU Serial: {invoice.etims_cu_serial_no}", styles["Small"]))

    doc.build(story)
    buffer.seek(0)
    response = HttpResponse(buffer, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="invoice-{invoice.invoice_number}.pdf"'
    return response

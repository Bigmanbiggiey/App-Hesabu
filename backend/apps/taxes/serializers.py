from rest_framework import serializers
from .models import TaxPeriod, VATReturn, Employee, PAYEReturn


class TaxPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxPeriod
        fields = [
            "id", "period_type", "year", "month",
            "status", "locked_at", "submitted_at",
            "itax_submission_ref", "created_at",
        ]
        read_only_fields = ["id", "status", "locked_at", "submitted_at", "created_at"]


class VATReturnSerializer(serializers.ModelSerializer):
    period_display = serializers.CharField(source="tax_period.__str__", read_only=True)

    class Meta:
        model = VATReturn
        fields = [
            "id", "tax_period", "period_display",
            "output_vat", "input_vat", "net_vat_payable",
            "return_data", "created_at",
        ]
        read_only_fields = ["id", "net_vat_payable", "created_at"]


class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id", "employee_number", "first_name", "last_name", "full_name",
            "kra_pin", "nhif_number", "nssf_number", "id_number",
            "email", "phone", "gross_salary", "basic_salary",
            "allowances", "is_active", "date_of_joining", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        validated_data["organization"] = self.context["request"].organization
        return super().create(validated_data)


class PAYEReturnSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = PAYEReturn
        fields = [
            "id", "tax_period", "employee", "employee_name",
            "gross_pay", "taxable_income", "paye_deducted",
            "personal_relief", "nhif_deduction", "nssf_deduction",
            "housing_levy", "net_pay", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PayrollCalculatorSerializer(serializers.Serializer):
    gross_salary = serializers.DecimalField(max_digits=12, decimal_places=2)

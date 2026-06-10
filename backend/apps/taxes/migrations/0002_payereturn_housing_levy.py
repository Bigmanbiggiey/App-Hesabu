from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("taxes", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="payereturn",
            name="housing_levy",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]

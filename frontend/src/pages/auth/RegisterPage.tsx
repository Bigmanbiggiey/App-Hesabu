import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import api, { networkErrorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const schema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().min(1, "Required"),
  email: z.string().email("Enter a valid email"),
  phone_number: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  organization_name: z.string().min(2, "Company name is required"),
  kra_pin: z
    .string()
    .regex(/^[A-Z]\d{9}[A-Z]$/i, "KRA PIN format: A000000000B")
    .transform((v) => v.toUpperCase()),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    try {
      await api.post("/auth/register/", data);
      await login(data.email, data.password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      const msg = detail
        ? Object.values(detail).flat().join(" ")
        : "Registration failed. Please try again.";
      setServerError(networkErrorMessage(err) ?? msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="Hesabu" className="h-12 w-12 mb-4" />
          <h1 className="text-2xl font-bold text-text">Start your free trial</h1>
          <p className="text-sm text-muted mt-1">14 days free · No credit card required</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="First name"
                placeholder="John"
                error={errors.first_name?.message}
                {...register("first_name")}
              />
              <Input
                label="Last name"
                placeholder="Kamau"
                error={errors.last_name?.message}
                {...register("last_name")}
              />
            </div>

            <Input
              label="Work email"
              type="email"
              placeholder="john@company.co.ke"
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Phone number"
              type="tel"
              placeholder="+254 7XX XXX XXX"
              error={errors.phone_number?.message}
              {...register("phone_number")}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              error={errors.password?.message}
              {...register("password")}
            />

            <hr className="border-border" />

            <Input
              label="Company / Business name"
              placeholder="Kamau Trading Ltd"
              error={errors.organization_name?.message}
              {...register("organization_name")}
            />

            <Input
              label="KRA PIN"
              placeholder="A000000000B"
              hint="Your company's KRA Personal Identification Number"
              error={errors.kra_pin?.message}
              {...register("kra_pin")}
            />

            {serverError && (
              <p className="text-sm text-danger bg-red-50 px-3 py-2 rounded-lg">
                {serverError}
              </p>
            )}

            <Button type="submit" loading={isSubmitting} className="w-full">
              Create account &amp; start trial
            </Button>
          </form>

          <p className="text-center text-sm text-muted mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

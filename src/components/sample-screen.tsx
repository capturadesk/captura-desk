import {
  CreditCard,
  LayoutDashboard,
  Users,
  ChartNoAxesCombined,
  Settings,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SampleScreen({
  step = 0,
  compact = false,
}: {
  step?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("sample-shot", compact && "pointer-events-none")}
      aria-label={`Illustrative payment application, step ${step + 1}`}
    >
      <div className="flex h-7 items-center gap-1 border-b bg-neutral-50 px-3">
        <i className="size-1.5 rounded-full bg-neutral-300" />
        <i className="size-1.5 rounded-full bg-neutral-300" />
        <i className="size-1.5 rounded-full bg-neutral-300" />
        <span className="mx-auto text-[8px] text-neutral-400">
          acme.app / {step > 1 ? "payments / details" : "payments"}
        </span>
      </div>
      <div className="flex min-h-[215px]">
        <div className="w-[105px] shrink-0 border-r bg-[#fafafa] p-3">
          <div className="mb-6 flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
            <span className="size-3 rounded-sm bg-neutral-800" />
            acme
          </div>
          {[LayoutDashboard, CreditCard, Users, ChartNoAxesCombined, Settings].map(
            (Icon, i) => (
              <div
                key={i}
                className={cn(
                  "mb-1 flex items-center gap-1.5 rounded px-1.5 py-1.5 text-[8px]",
                  i === 1 && "bg-neutral-200/65 text-neutral-800",
                  i === 1 && step === 0 && "sample-highlight",
                )}
              >
                <Icon size={10} />
                {["Overview", "Payments", "Customers", "Reports", "Settings"][i]}
              </div>
            ),
          )}
        </div>
        <div className="min-w-0 flex-1 p-5">
          <div className="mb-4 flex justify-between text-[13px] font-semibold text-neutral-800">
            <span>
              {step < 2
                ? "Payments"
                : step === 3
                  ? "Customer details"
                  : "Payment details"}
            </span>
            <Search size={12} className="text-neutral-400" />
          </div>
          {step < 2 ? (
            <>
              <div className="mb-3 flex gap-5 border-b pb-2 text-[8px]">
                <span>All payments</span>
                <span>Succeeded</span>
                <span className={cn(step === 1 && "sample-highlight")}>Failed</span>
              </div>
              <div className="sample-row !py-1 text-neutral-400">
                <span>Customer</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              {["Olivia Rhye", "Phoenix Baker", "Lana Steiner"].map((name, i) => (
                <div key={name} className="sample-row">
                  <span>{name}</span>
                  <span>€ {i === 1 ? "249" : "149"}.00</span>
                  <span
                    className={cn(
                      "w-fit rounded px-1.5 py-0.5 text-[8px]",
                      i === 0
                        ? "bg-red-50 text-red-700"
                        : "bg-neutral-100 text-neutral-500",
                    )}
                  >
                    {i === 0 ? "Failed" : "Succeeded"}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="text-[10px]">
              <div className="mb-3 flex items-center justify-between border-b pb-3">
                <b>{step === 3 ? "Olivia Rhye" : "€ 149.00"}</b>
                <span
                  className={cn(
                    "rounded bg-neutral-100 px-2 py-1",
                    step === 5 && "sample-highlight",
                  )}
                >
                  {step === 5 ? "Succeeded" : step === 3 ? "Customer" : "Failed"}
                </span>
              </div>
              <div className="flex justify-between py-2 text-neutral-400">
                <span>{step === 3 ? "Email" : "Customer"}</span>
                <span className="text-neutral-600">
                  {step === 3 ? "olivia@example.com" : "Olivia Rhye"}
                </span>
              </div>
              <div
                className={cn(
                  "flex justify-between py-2",
                  step === 2 && "sample-highlight",
                )}
              >
                <span className="text-neutral-400">
                  {step === 3 ? "Billing country" : "Failure reason"}
                </span>
                <span>{step === 3 ? "United Kingdom" : "Insufficient funds"}</span>
              </div>
              {step === 4 && (
                <div className="mt-3 flex justify-end">
                  <span className="sample-highlight rounded bg-neutral-800 px-3 py-1.5 text-white">
                    Retry payment
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-between text-[7px] text-neutral-400">
            <span>Sample application · fictional data</span>
            <ChevronDown size={9} />
          </div>
        </div>
      </div>
    </div>
  );
}

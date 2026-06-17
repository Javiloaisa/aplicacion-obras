import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// Minimal own components: big touch targets, mobile-first (no shadcn here)

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-brand-500 text-ink-900 active:bg-brand-600 disabled:bg-brand-300 disabled:text-ink-700/60",
    secondary:
      "bg-white text-gray-800 border border-gray-300 active:bg-gray-100 disabled:text-gray-400",
    danger: "bg-red-600 text-white active:bg-red-700 disabled:bg-red-300",
  }[variant];
  return (
    <button
      className={`min-h-14 w-full rounded-xl px-4 text-lg font-semibold transition-colors ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg focus:border-brand-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg focus:border-brand-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-xl border border-gray-300 bg-white p-4 text-lg focus:border-brand-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-xl bg-red-50 p-3 text-base text-red-700" role="alert">
      {children}
    </p>
  );
}

export function Spinner({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-brand-500" />
      <span className="text-base">{label}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-lg text-gray-500">{children}</p>;
}

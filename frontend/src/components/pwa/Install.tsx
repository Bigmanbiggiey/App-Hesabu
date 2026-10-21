import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { promptInstall, useInstallMode } from "@/lib/pwa";

const DISMISS_KEY = "hesabu:install-banner-dismissed";

// localStorage can throw (private mode, blocked storage); the banner then just
// reappears next visit.
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

function IosInstallSteps({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Install Hesabu" size="sm">
      <ol className="space-y-4 text-sm">
        <li className="flex gap-3">
          <Share className="h-5 w-5 shrink-0 text-brand-600" />
          <span>
            Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
          </span>
        </li>
        <li className="flex gap-3">
          <SquarePlus className="h-5 w-5 shrink-0 text-brand-600" />
          <span>
            Scroll down and choose <strong>Add to Home Screen</strong>, then tap{" "}
            <strong>Add</strong>.
          </span>
        </li>
      </ol>
      <p className="mt-4 text-xs text-muted">
        Hesabu then opens full-screen from your home screen, like any other app.
      </p>
    </Modal>
  );
}

/** Renders nothing unless Hesabu can be installed on this device. */
export function InstallButton({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "link";
  className?: string;
}) {
  const mode = useInstallMode();
  const [showIosSteps, setShowIosSteps] = useState(false);
  if (!mode) return null;

  const onClick = () => (mode === "prompt" ? promptInstall() : setShowIosSteps(true));

  return (
    <>
      {variant === "link" ? (
        <button type="button" onClick={onClick} className={cn("sidebar-link w-full", className)}>
          <Download className="h-4 w-4 shrink-0" />
          Install app
        </button>
      ) : (
        <Button size="sm" onClick={onClick} className={className}>
          <Download className="h-4 w-4" />
          Install
        </Button>
      )}
      <IosInstallSteps open={showIosSteps} onClose={() => setShowIosSteps(false)} />
    </>
  );
}

/** One-time, dismissible suggestion to install; the sidebar keeps a permanent entry. */
export function InstallBanner() {
  const mode = useInstallMode();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!mode || dismissed) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
      <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0" />
      <p className="min-w-0 flex-1 text-sm text-brand-800">
        Install Hesabu for one-tap access from your home screen.
      </p>
      <InstallButton />
      <button
        type="button"
        onClick={() => {
          saveDismissed();
          setDismissed(true);
        }}
        className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

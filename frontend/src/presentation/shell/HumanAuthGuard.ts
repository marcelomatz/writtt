import { matzIcon } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../application/studioGateway";
import { AuthChallengeDTO, HumanTelemetryProof, HumanUnlockResult, t } from "../../domain";

export interface HumanAuthGuardOptions {
  container: HTMLElement;
  inputs: (HTMLInputElement | null | undefined)[];
  submitButtons: (HTMLButtonElement | null | undefined)[];
  statusEl: HTMLElement | null;
  holdSlotEl: HTMLElement | null;
  initialLocked: boolean;
  initialRetrySec: number;
  initialRequireHold: boolean;
  onCooldownExpired?: () => void;
  onReadyToSubmitAfterHold?: () => void;
}

export interface HumanAuthAttemptOutcome {
  status: "unlocked" | "denied" | "locked" | "need-hold" | "busy";
  retrySec?: number;
}

export interface HumanAuthController {
  attemptUnlock: (
    mode: "password" | "pin" | "vault-password" | "vault-pin",
    secret: string,
    totpCode?: string
  ) => Promise<HumanAuthAttemptOutcome>;
  destroy: () => void;
}

const HOLD_SCALE_MAX_MS = 2500;

export function mountHumanAuthController(opts: HumanAuthGuardOptions): HumanAuthController {
  const validInputs = opts.inputs.filter((el): el is HTMLInputElement => Boolean(el));
  const validButtons = opts.submitButtons.filter((el): el is HTMLButtonElement => Boolean(el));

  let destroyed = false;
  let submitting = false;
  let challenge: AuthChallengeDTO | null = null;
  let challengeReceivedLocalMs = Date.now();
  let challengePromise: Promise<AuthChallengeDTO | null> | null = null;

  // Keystroke & pointer kinematics state (Welford online mean & variance)
  let trustedKeystrokes = 0;
  let untrustedEvents = 0;
  let pasteDetected = false;
  let pointerMoves = 0;
  let lastKeyDownMs = 0;
  const activeKeyDownMap = new Map<string, number>();

  let flightCount = 0;
  let flightMean = 0;
  let flightM2 = 0;

  let dwellCount = 0;
  let dwellMean = 0;

  // Tactile hold state
  let forceHoldClient = Boolean(opts.initialRequireHold);
  let holdRendered = false;
  let holdCompleted = false;
  let holdTrusted = false;
  let holdDurationMs = 0;
  let holdStartMs = 0;
  let holdActive = false;
  let holdRafId: number | null = null;
  let pendingAutoSubmit = false;

  // Cooldown state
  let cooldownTimerId: number | null = null;
  let cooldownEndMs = 0;

  const resetTelemetry = (keepHoldRequirement: boolean) => {
    trustedKeystrokes = 0;
    untrustedEvents = 0;
    pasteDetected = false;
    lastKeyDownMs = 0;
    activeKeyDownMap.clear();
    flightCount = 0;
    flightMean = 0;
    flightM2 = 0;
    dwellCount = 0;
    dwellMean = 0;
    holdCompleted = false;
    holdTrusted = false;
    holdDurationMs = 0;
    holdActive = false;
    if (holdRafId !== null) {
      window.cancelAnimationFrame(holdRafId);
      holdRafId = null;
    }
    if (!keepHoldRequirement) {
      forceHoldClient = false;
    }
  };

  const getStdDevFlight = (): number => {
    if (flightCount < 2) return 0;
    return Math.sqrt(flightM2 / (flightCount - 1));
  };

  const isRoboticKeystrokes = (): boolean => {
    if (trustedKeystrokes >= 4 && flightMean > 0 && flightMean < 14) return true;
    if (trustedKeystrokes >= 5 && getStdDevFlight() < 1.2 && dwellMean > 0 && dwellMean < 4) return true;
    return false;
  };

  const mustHoldNow = (): boolean => {
    return Boolean(
      challenge?.requireHold ||
        forceHoldClient ||
        pasteDetected ||
        untrustedEvents > 0 ||
        isRoboticKeystrokes()
    );
  };

  const isCoolingDown = (): boolean => cooldownEndMs > Date.now();

  const setControlsDisabled = (disabled: boolean) => {
    validInputs.forEach((inp) => {
      inp.disabled = disabled;
    });
    validButtons.forEach((btn) => {
      btn.disabled = disabled;
    });
  };

  const setStatusText = (msg: string, tone: "neutral" | "denied" | "locked") => {
    if (!opts.statusEl) return;
    opts.statusEl.textContent = msg;
    opts.statusEl.classList.toggle("is-denied", tone === "denied");
    opts.statusEl.classList.toggle("is-locked", tone === "locked");
  };

  const fetchChallenge = async (): Promise<AuthChallengeDTO | null> => {
    challengePromise = WritttIPC.beginAuthChallenge()
      .then((ch) => {
        if (!destroyed) {
          challenge = ch;
          challengeReceivedLocalMs = Date.now();
          if (ch.requireHold) {
            forceHoldClient = true;
            if (!isCoolingDown()) ensureHoldWidgetRendered(false);
          } else if (holdRendered && !isCoolingDown()) {
            ensureHoldWidgetRendered(false);
          }
        }
        return ch;
      })
      .catch(() => null)
      .finally(() => {
        challengePromise = null;
      });
    return challengePromise;
  };

  const ensureChallenge = async (): Promise<AuthChallengeDTO | null> => {
    if (challenge) return challenge;
    if (challengePromise) return await challengePromise;
    return await fetchChallenge();
  };

  const renderHoldBounds = () => {
    if (!opts.holdSlotEl) return;
    const zoneEl = opts.holdSlotEl.querySelector("[data-hold-zone]") as HTMLElement | null;
    if (!zoneEl) return;
    const minMs = challenge?.holdMinMs ?? 1000;
    const maxMs = challenge?.holdMaxMs ?? 2050;
    const leftPct = Math.max(20, Math.min(70, (minMs / HOLD_SCALE_MAX_MS) * 100));
    const widthPct = Math.max(18, Math.min(100 - leftPct, ((maxMs - minMs) / HOLD_SCALE_MAX_MS) * 100));
    zoneEl.style.left = `${leftPct.toFixed(1)}%`;
    zoneEl.style.width = `${widthPct.toFixed(1)}%`;
  };

  const ensureHoldWidgetRendered = (highlightAttention: boolean) => {
    if (!opts.holdSlotEl || destroyed) return;
    if (isCoolingDown()) {
      opts.holdSlotEl.innerHTML = "";
      holdRendered = false;
      return;
    }

    if (!holdRendered) {
      holdRendered = true;
      opts.holdSlotEl.innerHTML = `
        <div class="writtt-human-guard" data-human-guard>
          <div class="writtt-human-guard-head">
            <span class="writtt-row-gap-xs">
              ${matzIcon("fingerprint", 12)}
              <span>${t("Confirmacao humana", "Human check", "Verificacion humana")}</span>
            </span>
            <span class="writtt-mono writtt-human-guard-state" data-hold-label>
              ${t("Segure ate a faixa verde", "Hold into green zone", "Manten hasta la zona verde")}
            </span>
          </div>
          <button type="button" class="writtt-human-hold-btn" data-hold-btn>
            <div class="writtt-human-hold-track">
              <div class="writtt-human-hold-zone" data-hold-zone></div>
              <div class="writtt-human-hold-fill" data-hold-fill></div>
            </div>
          </button>
        </div>
      `;

      const btn = opts.holdSlotEl.querySelector("[data-hold-btn]") as HTMLButtonElement | null;
      const fillEl = opts.holdSlotEl.querySelector("[data-hold-fill]") as HTMLElement | null;
      const labelEl = opts.holdSlotEl.querySelector("[data-hold-label]") as HTMLElement | null;
      const rootEl = opts.holdSlotEl.querySelector("[data-human-guard]") as HTMLElement | null;

      const stopAnim = () => {
        if (holdRafId !== null) {
          window.cancelAnimationFrame(holdRafId);
          holdRafId = null;
        }
      };

      const beginHold = (trusted: boolean) => {
        if (holdCompleted || isCoolingDown()) return;
        if (!trusted) {
          untrustedEvents++;
          return;
        }
        holdActive = true;
        holdStartMs = performance.now();
        rootEl?.classList.remove("is-attention");
        stopAnim();

        const tick = () => {
          if (!holdActive || destroyed) return;
          const elapsed = performance.now() - holdStartMs;
          const minMs = challenge?.holdMinMs ?? 1000;
          const maxMs = challenge?.holdMaxMs ?? 2050;
          const pct = Math.min(100, (elapsed / HOLD_SCALE_MAX_MS) * 100);
          if (fillEl) {
            fillEl.style.width = `${pct.toFixed(1)}%`;
            fillEl.classList.toggle("is-in-zone", elapsed >= minMs && elapsed <= maxMs);
          }
          if (labelEl) {
            if (elapsed >= minMs && elapsed <= maxMs) {
              labelEl.textContent = t("Solte agora", "Release now", "Suelta ahora");
            } else if (elapsed > maxMs) {
              holdActive = false;
              if (fillEl) {
                fillEl.style.width = "0%";
                fillEl.classList.remove("is-in-zone");
              }
              labelEl.textContent = t("Segure novamente", "Hold again", "Intenta de nuevo");
              return;
            } else {
              labelEl.textContent = t("Mantenha pressionado...", "Keep holding...", "Manten presionado...");
            }
          }
          holdRafId = window.requestAnimationFrame(tick);
        };
        holdRafId = window.requestAnimationFrame(tick);
      };

      const endHold = (trusted: boolean) => {
        if (!holdActive) return;
        holdActive = false;
        stopAnim();
        if (!trusted) {
          untrustedEvents++;
          return;
        }
        const elapsed = Math.round(performance.now() - holdStartMs);
        const minMs = challenge?.holdMinMs ?? 1000;
        const maxMs = challenge?.holdMaxMs ?? 2050;
        if (elapsed >= minMs && elapsed <= maxMs) {
          holdCompleted = true;
          holdTrusted = true;
          holdDurationMs = elapsed;
          rootEl?.classList.add("is-verified");
          if (fillEl) {
            fillEl.classList.add("is-in-zone");
          }
          if (labelEl) {
            labelEl.textContent = t("Confirmado", "Verified", "Verificado");
          }
          if (pendingAutoSubmit) {
            pendingAutoSubmit = false;
            opts.onReadyToSubmitAfterHold?.();
          }
        } else {
          if (fillEl) {
            fillEl.style.width = "0%";
            fillEl.classList.remove("is-in-zone");
          }
          if (labelEl) {
            labelEl.textContent = t("Segure ate a faixa verde", "Hold into green zone", "Manten hasta la zona verde");
          }
        }
      };

      btn?.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        beginHold(e.isTrusted);
      });
      btn?.addEventListener("pointerup", (e) => {
        e.preventDefault();
        endHold(e.isTrusted);
      });
      btn?.addEventListener("pointercancel", () => endHold(false));
      btn?.addEventListener("keydown", (e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          beginHold(e.isTrusted);
        }
      });
      btn?.addEventListener("keyup", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          endHold(e.isTrusted);
        }
      });
    }

    renderHoldBounds();
    if (highlightAttention) {
      const rootEl = opts.holdSlotEl.querySelector("[data-human-guard]") as HTMLElement | null;
      rootEl?.classList.remove("is-attention");
      void rootEl?.offsetWidth;
      rootEl?.classList.add("is-attention");
      (opts.holdSlotEl.querySelector("[data-hold-btn]") as HTMLButtonElement | null)?.focus();
    }
  };

  const clearHoldWidget = () => {
    if (opts.holdSlotEl) {
      opts.holdSlotEl.innerHTML = "";
    }
    holdRendered = false;
  };

  const startCooldown = (seconds: number) => {
    const cleanSec = Math.max(1, Math.ceil(seconds));
    cooldownEndMs = Date.now() + cleanSec * 1000;
    if (cooldownTimerId !== null) {
      window.clearInterval(cooldownTimerId);
      cooldownTimerId = null;
    }
    validInputs.forEach((inp) => {
      inp.value = "";
    });
    setControlsDisabled(true);
    clearHoldWidget();

    const updateTick = () => {
      if (destroyed) return;
      const rem = Math.ceil((cooldownEndMs - Date.now()) / 1000);
      if (rem <= 0) {
        if (cooldownTimerId !== null) {
          window.clearInterval(cooldownTimerId);
          cooldownTimerId = null;
        }
        cooldownEndMs = 0;
        forceHoldClient = true;
        resetTelemetry(true);
        setControlsDisabled(false);
        setStatusText(t("Acesso restrito", "Restricted access", "Acceso restringido"), "neutral");
        void fetchChallenge().then(() => {
          if (!destroyed) {
            ensureHoldWidgetRendered(false);
            validInputs[0]?.focus();
            opts.onCooldownExpired?.();
          }
        });
        return;
      }
      setStatusText(
        `${t("Acesso temporariamente bloqueado. Aguarde", "Temporarily locked. Wait", "Temporalmente bloqueado. Espera")} ${rem}s`,
        "locked"
      );
    };

    updateTick();
    cooldownTimerId = window.setInterval(updateTick, 250);
  };

  // Wire input kinematics listeners
  const cleanups: (() => void)[] = [];

  const onPointerMove = (e: PointerEvent) => {
    if (e.isTrusted) pointerMoves++;
  };
  opts.container.addEventListener("pointermove", onPointerMove, { passive: true });
  cleanups.push(() => opts.container.removeEventListener("pointermove", onPointerMove));

  validInputs.forEach((inp) => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.isTrusted) {
        untrustedEvents++;
        forceHoldClient = true;
        ensureHoldWidgetRendered(false);
        return;
      }
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta" || e.key === "Tab" || e.key === "Enter" || e.key === "Escape") {
        return;
      }
      const now = performance.now();
      if (lastKeyDownMs > 0) {
        const flight = now - lastKeyDownMs;
        flightCount++;
        const delta = flight - flightMean;
        flightMean += delta / flightCount;
        flightM2 += delta * (flight - flightMean);
      }
      lastKeyDownMs = now;
      activeKeyDownMap.set(e.code || e.key, now);
      trustedKeystrokes++;
      if (isRoboticKeystrokes()) {
        forceHoldClient = true;
        ensureHoldWidgetRendered(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.isTrusted) {
        untrustedEvents++;
        return;
      }
      const start = activeKeyDownMap.get(e.code || e.key);
      if (start !== undefined) {
        activeKeyDownMap.delete(e.code || e.key);
        const dwell = Math.max(0, performance.now() - start);
        dwellCount++;
        dwellMean += (dwell - dwellMean) / dwellCount;
      }
    };

    const onPasteOrDrop = () => {
      pasteDetected = true;
      forceHoldClient = true;
      ensureHoldWidgetRendered(false);
    };

    const onInput = (e: Event) => {
      if (!e.isTrusted) {
        untrustedEvents++;
        forceHoldClient = true;
        ensureHoldWidgetRendered(false);
        return;
      }
      if (inp.value.length >= 2 && trustedKeystrokes === 0) {
        pasteDetected = true;
        forceHoldClient = true;
        ensureHoldWidgetRendered(false);
      }
    };

    inp.addEventListener("keydown", onKeyDown);
    inp.addEventListener("keyup", onKeyUp);
    inp.addEventListener("paste", onPasteOrDrop);
    inp.addEventListener("drop", onPasteOrDrop);
    inp.addEventListener("input", onInput);

    cleanups.push(() => {
      inp.removeEventListener("keydown", onKeyDown);
      inp.removeEventListener("keyup", onKeyUp);
      inp.removeEventListener("paste", onPasteOrDrop);
      inp.removeEventListener("drop", onPasteOrDrop);
      inp.removeEventListener("input", onInput);
    });
  });

  // Initialize state
  if (opts.initialLocked && opts.initialRetrySec > 0) {
    startCooldown(opts.initialRetrySec);
  } else {
    void fetchChallenge().then(() => {
      if (!destroyed && mustHoldNow()) {
        ensureHoldWidgetRendered(false);
      }
    });
    if (opts.initialRequireHold) {
      ensureHoldWidgetRendered(false);
    }
  }

  return {
    async attemptUnlock(mode, secret, totpCode = "") {
      if (destroyed || submitting) return { status: "busy" };
      if (isCoolingDown()) {
        const rem = Math.max(1, Math.ceil((cooldownEndMs - Date.now()) / 1000));
        return { status: "locked", retrySec: rem };
      }
      if (!secret) return { status: "denied" };

      const ch = await ensureChallenge();
      if (trustedKeystrokes === 0) {
        pasteDetected = true;
        forceHoldClient = true;
      }

      if (mustHoldNow() && !holdCompleted) {
        pendingAutoSubmit = true;
        ensureHoldWidgetRendered(true);
        return { status: "need-hold" };
      }

      submitting = true;
      setControlsDisabled(true);

      try {
        // Ensure fast legitimate human typists meet minimum challenge dwell (~280ms)
        if (ch && trustedKeystrokes > 0 && untrustedEvents === 0) {
          const localElapsed = Date.now() - challengeReceivedLocalMs;
          if (localElapsed < ch.minElapsedMs) {
            await new Promise((r) => window.setTimeout(r, ch.minElapsedMs - localElapsed + 20));
          }
        }

        const proof: HumanTelemetryProof = {
          challengeId: ch?.challengeId ?? 0,
          nonce: ch?.nonce ?? "",
          issuedAtMs: ch?.issuedAtMs ?? 0,
          minElapsedMs: ch?.minElapsedMs ?? 280,
          requireHold: ch?.requireHold ?? forceHoldClient,
          holdMinMs: ch?.holdMinMs ?? 1000,
          holdMaxMs: ch?.holdMaxMs ?? 2050,
          signature: ch?.signature ?? "",
          trustedKeystrokes,
          untrustedEvents,
          pasteDetected,
          meanFlightMs: flightMean,
          stdDevFlightMs: getStdDevFlight(),
          meanDwellMs: dwellMean,
          pointerMoves,
          holdCompleted,
          holdDurationMs,
          holdTrusted,
        };

        const res: HumanUnlockResult = await WritttIPC.unlockWithHumanProof({
          mode,
          secret,
          totpCode,
          proof,
        });

        if (res.unlocked) {
          return { status: "unlocked" };
        }

        challenge = null;
        pendingAutoSubmit = false;
        forceHoldClient = Boolean(res.requireHold || true);
        resetTelemetry(true);
        validInputs.forEach((inp) => {
          if (inp.type === "password") inp.value = "";
        });

        if (res.locked && res.retrySec > 0) {
          startCooldown(res.retrySec);
          return { status: "locked", retrySec: res.retrySec };
        }

        setControlsDisabled(false);
        setStatusText(t("Acesso negado.", "Access denied.", "Acceso denegado."), "denied");
        clearHoldWidget();
        await fetchChallenge();
        ensureHoldWidgetRendered(false);
        validInputs[0]?.focus();
        return { status: "denied" };
      } catch {
        challenge = null;
        resetTelemetry(true);
        setControlsDisabled(false);
        setStatusText(t("Acesso negado.", "Access denied.", "Acceso denegado."), "denied");
        void fetchChallenge().then(() => {
          if (!destroyed) ensureHoldWidgetRendered(false);
        });
        return { status: "denied" };
      } finally {
        submitting = false;
      }
    },

    destroy() {
      destroyed = true;
      if (cooldownTimerId !== null) {
        window.clearInterval(cooldownTimerId);
        cooldownTimerId = null;
      }
      if (holdRafId !== null) {
        window.cancelAnimationFrame(holdRafId);
        holdRafId = null;
      }
      cleanups.forEach((fn) => fn());
    },
  };
}

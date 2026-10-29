"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { acceptNotice } from "@/lib/actions/notice";
import { logout } from "@/lib/actions/auth";

/** The application number, as filed. */
const INPI_REQUEST = "20262008502041";

/**
 * The confidentiality, IP and patent notice, after every sign-in (by
 * request, 2026-10-29; see src/lib/notice.ts). Only the button closes it —
 * not Escape, not a click outside — and confirming records the first
 * acceptance. The text as given, in Portuguese with its English headings:
 * it is the notice, not interface copy.
 */
export function ConfidentialityNotice() {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  // Declined: signed out, back to the sign-in page.
  function decline() {
    startTransition(async () => {
      await logout();
    });
  }

  function accept() {
    startTransition(async () => {
      await acceptNotice();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      // Closed only by the button.
      onOpenChange={() => {}}
    >
      <DialogContent
        showClose={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 p-0 sm:max-w-xl"
      >
        <div className="overflow-y-auto px-6 pt-7 pb-4 sm:px-8 sm:pt-8">
          <DialogTitle className="font-display text-xl leading-tight font-bold">
            BIKIT — Confidentiality, Intellectual Property &amp; Patent Notice
          </DialogTitle>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            Private &amp; Confidential — Closed Beta
          </p>
          <DialogDescription
            render={<div />}
            className="mt-5 space-y-3 text-[15px] leading-relaxed text-foreground"
          >
            <p>
              Todos os componentes do projeto BIKIT, incluindo o dispositivo de
              telemetria (logger), o seu design, hardware, firmware, algoritmos,
              tecnologias, plataforma digital, funcionalidades e sistemas
              integrados, constituem propriedade intelectual do projeto BIKIT.
            </p>
            <p>
              O sistema BIKIT é objeto de um Pedido Provisório de Patente
              apresentado junto do Instituto Nacional da Propriedade Industrial
              (INPI), sob o número {INPI_REQUEST}, encontrando-se em processo de
              proteção da sua propriedade industrial.
            </p>
            <p>
              É expressamente proibida a cópia, reprodução, replicação,
              distribuição, divulgação, engenharia inversa ou utilização não
              autorizada de qualquer componente, informação técnica ou
              funcionalidade do sistema sem autorização prévia e por escrito.
            </p>
            <p>
              A plataforma BIKIT encontra-se atualmente em fase de beta fechada,
              com acesso restrito a utilizadores selecionados. Toda a
              informação, tecnologia, documentação e funcionalidades
              disponibilizadas devem ser tratadas como estritamente
              confidenciais.
            </p>
            <p className="font-semibold">
              Ao aceder ou utilizar a plataforma e os sistemas BIKIT, o
              utilizador compromete-se a preservar a confidencialidade de todos
              os seus elementos, abstendo-se de os divulgar, partilhar,
              reproduzir ou disponibilizar a terceiros sem autorização expressa
              e por escrito.
            </p>
          </DialogDescription>
          <div className="mt-5 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
            <p>© 2026 BIKIT. All rights reserved.</p>
            <p>Patent Application Pending — INPI Portugal</p>
            <p>Pedido Provisório de Patente n.º {INPI_REQUEST}</p>
          </div>
        </div>
        {/* Accept, black with the brand's green, large and centred; beside
            it, decline — which signs out (by request, 2026-10-29). */}
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border px-6 py-5 sm:px-8">
          <Button
            variant="outline"
            onClick={decline}
            disabled={pending}
            className="h-12 px-6 text-base"
          >
            Não aceito
          </Button>
          <Button
            onClick={accept}
            disabled={pending}
            className="h-12 bg-foreground px-8 text-base font-semibold text-primary hover:bg-foreground/85 dark:bg-[#34373d] dark:hover:bg-[#3e4148]"
          >
            {pending ? "A confirmar…" : "Li e aceito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

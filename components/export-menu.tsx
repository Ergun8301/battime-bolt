'use client';

// Lot 11 — le MÊME menu « Exporter ▾ » partout (équipe et fiche salarié) :
// PDF, Excel, CSV, toujours dans cet ordre, une ligne chacun.
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type ExportKind = 'pdf' | 'excel' | 'csv';

const ITEMS: { kind: ExportKind; label: string; sub: string; Icon: typeof FileText }[] = [
  { kind: 'pdf', label: 'PDF', sub: 'À lire ou imprimer', Icon: FileText },
  { kind: 'excel', label: 'Excel', sub: 'Tableau détaillé', Icon: FileSpreadsheet },
  { kind: 'csv', label: 'CSV', sub: 'Pour le logiciel de paie', Icon: Table },
];

export function ExportMenu({ onPick, disabled = false, busy = false, align = 'end', testId = 'export-menu' }: {
  onPick: (k: ExportKind) => void;
  disabled?: boolean;
  busy?: boolean;
  align?: 'start' | 'end' | 'center';
  testId?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" disabled={disabled || busy} data-testid={testId} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exporter <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="bt-skin w-60 max-w-[85vw]">
        {ITEMS.map(({ kind, label, sub, Icon }) => (
          <DropdownMenuItem key={kind} data-testid={`${testId}-${kind}`} onSelect={() => onPick(kind)} className="flex cursor-pointer items-start gap-2.5 py-2">
            <Icon className="mt-0.5 h-4 w-4 flex-none" />
            <span className="min-w-0">
              <span className="block text-[14px] font-extrabold leading-tight">{label}</span>
              <span className="block text-[12px] text-[#6E6A63]">{sub}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

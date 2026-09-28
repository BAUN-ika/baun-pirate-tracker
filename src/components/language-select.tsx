import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, useI18n, type LangCode } from "@/i18n/i18n";

export function LanguageSelect() {
  const { lang, setLang } = useI18n();
  return (
    <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
      <SelectTrigger className="h-8 w-auto min-w-36 gap-1.5" aria-label="Language" data-no-i18n>
        <Languages className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent data-no-i18n>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

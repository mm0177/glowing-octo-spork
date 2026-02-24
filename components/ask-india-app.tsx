"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, ChevronUp, Loader2, Send, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AskResponse, PersonaResponse } from "@/lib/schemas";

// Dynamic import to avoid SSR issues with mapbox-gl
const IndiaMap = dynamic(
  () => import("@/components/india-map").then((m) => m.IndiaMap),
  { ssr: false }
);

type AskApiResponse = AskResponse & { error?: string; request_id?: string };

type OptionsApiResponse = {
  states: string[];
  occupations: string[];
  models: Array<{
    id: string;
    label: string;
    provider: string;
    available: boolean;
  }>;
  default_model: string | null;
  error?: string;
};

const SUGGESTED_QUESTIONS = [
  "Should India make college education free for all?",
  "What's your biggest concern about the cost of living?",
  "Do you think remote work should become permanent in India?",
  "How do you feel about the state of healthcare in your area?",
  "Should the government prioritise rural development over smart cities?",
];

function sentimentPillClass(sentiment: string) {
  if (sentiment === "positive") return "bg-green-900/60 text-green-300 border-green-800";
  if (sentiment === "negative") return "bg-red-900/60 text-red-300 border-red-800";
  return "bg-yellow-900/60 text-yellow-300 border-yellow-800";
}

function MultiSelectFilter(props: {
  label: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const selectedSet = useMemo(() => new Set(props.value), [props.value]);
  const triggerLabel =
    props.value.length === 0
      ? props.placeholder
      : props.value.length <= 2
        ? props.value.join(", ")
        : `${props.value.length} selected`;

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">
        {props.label}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between overflow-hidden text-left text-xs font-normal backdrop-blur-sm"
            disabled={props.disabled}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-50 w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${props.label.toLowerCase()}...`}
            />
            <CommandList>
              <CommandEmpty>No match found.</CommandEmpty>
              <ScrollArea className="h-52">
                <CommandGroup>
                  {props.options.map((option) => {
                    const checked = selectedSet.has(option);
                    return (
                      <CommandItem
                        key={option}
                        value={option}
                        onSelect={() => {
                          const next = checked
                            ? props.value.filter((item) => item !== option)
                            : [...props.value, option];
                          props.onChange(next);
                        }}
                        className="gap-2"
                      >
                        <Checkbox
                          checked={checked}
                          className="pointer-events-none size-3.5"
                        />
                        <span className="truncate text-xs">{option}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </ScrollArea>
            </CommandList>
          </Command>
          {props.value.length > 0 && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-full text-[11px]"
                onClick={() => props.onChange([])}
              >
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AskIndiaApp() {
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [sampleSize, setSampleSize] = useState(30);
  const [sex, setSex] = useState<string>("any");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedOccupations, setSelectedOccupations] = useState<string[]>([]);

  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [occupationOptions, setOccupationOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<
    OptionsApiResponse["models"]
  >([]);
  const [model, setModel] = useState<string>("");

  const [question, setQuestion] = useState("");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load options ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const res = await fetch("/api/options");
        if (!cancelled) {
          const json = (await res.json()) as OptionsApiResponse;
          setStateOptions(json.states ?? []);
          setOccupationOptions(json.occupations ?? []);
          setModelOptions(json.models ?? []);
          const firstAvailable =
            json.models.find((m) => m.available)?.id ?? "";
          const defaultModel =
            json.default_model &&
            json.models.some(
              (m) => m.id === json.default_model && m.available
            )
              ? json.default_model
              : firstAvailable;
          setModel(defaultModel);
          if (!defaultModel) {
            setError("No model configured on server. Add GROQ_API_KEY.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load options."
          );
        }
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Filtered responses ──────────────────────────────────────────────────
  const responses = useMemo(() => {
    if (!result) return [];
    const base = selectedState
      ? result.responses.filter(
          (r: PersonaResponse) => r.state === selectedState
        )
      : result.responses;
    return [...base].sort(
      (a: PersonaResponse, b: PersonaResponse) => b.confidence - a.confidence
    );
  }, [result, selectedState]);

  const selectedModelLabel =
    modelOptions.find((m) => m.id === model)?.label ?? "Select model";

  // ── Submit ──────────────────────────────────────────────────────────────
  async function askQuestion(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setError("Please enter a question first.");
      return;
    }
    if (!model) {
      setError("No model selected.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedState(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          age_min: ageMin,
          age_max: ageMax,
          sample_size: sampleSize,
          sex: sex === "any" ? undefined : sex,
          states: selectedStates.length > 0 ? selectedStates : undefined,
          occupations:
            selectedOccupations.length > 0 ? selectedOccupations : undefined,
          model,
        }),
      });
      const json = (await res.json()) as AskApiResponse;
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      setResult(json);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (question.trim() && !isLoading) void askQuestion(question);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, isLoading]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await askQuestion(question);
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* Map — full viewport */}
      <IndiaMap
        stateSentiments={result?.state_sentiments ?? {}}
        selectedState={selectedState}
        onSelectState={setSelectedState}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        className="absolute inset-0"
      />

      {/* Title */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <div className="rounded-lg border border-gray-700/60 bg-gray-900/70 px-3 py-1.5 shadow-lg backdrop-blur-sm">
          <h1 className="text-lg font-semibold tracking-wide text-gray-100 md:text-xl">
            Ask India
          </h1>
        </div>
      </div>

      {/* Audience filter panel — top left */}
      <div className="absolute top-3 left-3 z-10 w-64">
        <Card className="border border-gray-700/60 bg-gray-900/80 py-0 shadow-lg backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-gray-300">
              Audience
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-gray-400 hover:text-gray-200"
              onClick={() => setFiltersCollapsed((v) => !v)}
            >
              {filtersCollapsed ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
          </CardHeader>

          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out",
              filtersCollapsed
                ? "pointer-events-none max-h-0 opacity-0"
                : "max-h-168 opacity-100"
            )}
          >
            <CardContent className="px-3 pt-0 pb-3">
              <div className="space-y-2">
                {/* Age + Sample size */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    {
                      id: "age-min",
                      label: "Min Age",
                      value: ageMin,
                      set: setAgeMin,
                    },
                    {
                      id: "age-max",
                      label: "Max Age",
                      value: ageMax,
                      set: setAgeMax,
                    },
                    {
                      id: "sample-size",
                      label: "Sample",
                      value: sampleSize,
                      set: setSampleSize,
                    },
                  ].map(({ id, label, value, set }) => (
                    <div key={id} className="space-y-1">
                      <Label
                        htmlFor={id}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        {label}
                      </Label>
                      <Input
                        id={id}
                        type="number"
                        min={id === "sample-size" ? 5 : 18}
                        max={id === "sample-size" ? 100 : 100}
                        value={value}
                        onChange={(e) => set(Number(e.target.value))}
                        disabled={isLoading}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>

                {/* Sex */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Sex
                  </Label>
                  <Select
                    value={sex}
                    onValueChange={setSex}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-7 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* States multi-select */}
                <MultiSelectFilter
                  label="States / UTs"
                  value={selectedStates}
                  options={stateOptions}
                  onChange={setSelectedStates}
                  disabled={isLoadingOptions || isLoading}
                  placeholder="All 36 states"
                />

                {/* Occupations multi-select */}
                <MultiSelectFilter
                  label="Occupations"
                  value={selectedOccupations}
                  options={occupationOptions}
                  onChange={setSelectedOccupations}
                  disabled={isLoadingOptions || isLoading}
                  placeholder="All occupations"
                />
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Results panel — top right */}
      <div className="absolute top-3 right-3 z-10 flex w-72 flex-col overflow-hidden" style={{ height: "calc(100dvh - 7rem)" }}>
        <Card className="flex min-h-0 flex-1 flex-col border border-gray-700/60 bg-gray-900/80 py-0 shadow-lg backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-gray-300">
              {result
                ? `${result.summary.total} responses · ${result.summary.positive}↑ ${result.summary.neutral}→ ${result.summary.negative}↓`
                : "Results"}
            </CardTitle>
            {selectedState && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                onClick={() => setSelectedState(null)}
              >
                {selectedState.length > 14
                  ? selectedState.slice(0, 14) + "…"
                  : selectedState}
                <X className="size-3" />
              </Button>
            )}
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col px-3 pt-0 pb-3">
            {!result ? (
              <p className="rounded border border-dashed border-gray-700 bg-gray-800/40 px-2 py-6 text-center text-xs text-gray-500">
                Ask a question to see results here.
              </p>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 pr-2">
                  {responses.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500">
                      No responses for this state.
                    </p>
                  ) : (
                    responses.map((item: PersonaResponse) => (
                      <article
                        key={item.uuid}
                        className="rounded-md border border-gray-700/60 bg-gray-800/50 p-2"
                      >
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
                          <p className="min-w-0">
                            <span className="font-semibold text-gray-200">
                              {item.profile.occupation}
                            </span>
                            <span className="mx-0.5 opacity-40">|</span>
                            <span>{item.profile.age}</span>
                            <span className="mx-0.5 opacity-40">|</span>
                            <span>{item.state}</span>
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1.5 py-px text-[10px]",
                              sentimentPillClass(item.sentiment)
                            )}
                          >
                            {item.sentiment}
                          </span>
                          <span className="shrink-0 rounded-full border border-gray-700 bg-gray-900/60 px-1.5 py-px text-[10px] text-gray-400">
                            {Math.round(item.confidence * 100)}%
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-snug text-gray-200">
                          {item.answer}
                        </p>
                        {item.reasoning && (
                          <p className="mt-1 text-[11px] italic leading-snug text-gray-500">
                            {item.reasoning}
                          </p>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Question bar — bottom centre */}
      <div className="absolute bottom-3 left-1/2 z-20 w-full max-w-176 -translate-x-1/2 px-4">
        {/* Suggestion pills */}
        <div className="mb-2.5 flex flex-wrap justify-center gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <Badge
              key={q}
              variant="outline"
              className={cn(
                "cursor-pointer border-gray-700 bg-gray-900/70 px-3 py-1 text-xs text-gray-300 backdrop-blur-sm transition hover:bg-gray-800",
                (isLoading || isLoadingOptions) &&
                  "pointer-events-none opacity-40"
              )}
              onClick={() => {
                if (!isLoading && !isLoadingOptions) {
                  setQuestion(q);
                  textareaRef.current?.focus();
                }
              }}
            >
              {q}
            </Badge>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask India anything…"
              maxLength={280}
              disabled={isLoading || isLoadingOptions}
              className={cn(
                "max-h-55 min-h-19 resize-none rounded-xl border-gray-700 bg-gray-900/60 pr-52 text-sm text-gray-100 shadow-lg backdrop-blur-sm placeholder:text-gray-500",
                "focus:border-gray-500 focus:ring-0 focus-visible:ring-0",
                (isLoading || isLoadingOptions) &&
                  "cursor-not-allowed opacity-50"
              )}
              rows={1}
            />

            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Model picker */}
              <Popover
                open={isModelPickerOpen}
                onOpenChange={setIsModelPickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isLoadingOptions}
                    className="h-8 max-w-44 gap-1 rounded-md bg-transparent px-2 text-[11px] text-gray-400 shadow-none hover:bg-transparent hover:text-gray-200"
                  >
                    <span className="truncate">{selectedModelLabel}</span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1" align="end" side="top">
                  <div className="space-y-1">
                    {modelOptions.map((m) => (
                      <Button
                        key={m.id}
                        type="button"
                        variant="ghost"
                        disabled={!m.available}
                        className="h-8 w-full justify-start gap-1 rounded-md text-left text-xs font-normal"
                        onClick={() => {
                          setModel(m.id);
                          setIsModelPickerOpen(false);
                        }}
                      >
                        <span className="truncate">{m.label}</span>
                        {!m.available && (
                          <span className="text-[10px] text-gray-500">
                            (Unavailable)
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Submit / loading */}
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                >
                  <Loader2 className="size-4 animate-spin text-orange-400" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-8 bg-orange-600 text-white hover:bg-orange-700"
                  disabled={
                    !question.trim() ||
                    isLoadingOptions ||
                    !model ||
                    !modelOptions.find((m) => m.id === model)?.available
                  }
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </form>

        {error && (
          <p className="mt-1.5 rounded border border-red-800 bg-red-950/60 px-2 py-1 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <p className="mt-2 text-center text-[10px] leading-relaxed text-gray-600">
          AI-generated responses from synthetic Indian personas — not real
          opinions.{" "}
          Personas from{" "}
          <a
            href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-India"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-400"
          >
            NVIDIA Nemotron-Personas-India
          </a>
          {" "}(CC BY 4.0). Map data ©{" "}
          <a
            href="https://www.mapbox.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-400"
          >
            Mapbox
          </a>
          .
        </p>
      </div>
    </main>
  );
}

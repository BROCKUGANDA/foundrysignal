/**
 * FoundrySignal Design System — public API.
 *
 * Import everything through this barrel so the internal file layout can change
 * without touching consumers:
 *
 *   import { Button, VentureCard, tokens } from "@/components/fs";
 *
 * Layers, from most primitive to most specific:
 *   tokens/   CSS custom properties (src/styles/fs/*.css)
 *   brand/    logo family, glyphs, prism, loader
 *   ui/       base components with the full state contract
 *   domain/   venture-intelligence components
 *   motion    durations, easings, variants, reduced-motion gate
 *
 * Nothing in this package imports from `@/lib/domain`, `@/lib/client`, or any
 * route component. The dependency arrow only points inward, which is what
 * makes the system reusable across surfaces.
 */

/* ─── Base components ───────────────────────────────────────────────── */

export { Button, buttonVariants, type ButtonProps } from "./ui/button";
export {
  Badge,
  badgeVariants,
  VerificationBadge,
  ClaimBadge,
  StaleBadge,
  VERIFICATION_TONE,
  CLAIM_TONE,
  type BadgeProps,
  type BadgeTone,
  type Verification,
  type ClaimStatus,
} from "./ui/badge";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardVariant,
} from "./ui/card";
export {
  Input,
  Textarea,
  FieldLabel,
  Field,
  CONTROL_BASE,
  CONTROL_SIZE,
  type InputProps,
  type TextareaProps,
  type FieldLabelProps,
  type ControlSize,
} from "./ui/input";
export {
  Select,
  Checkbox,
  Switch,
  RadioGroup,
  type SelectProps,
  type CheckboxProps,
  type SwitchProps,
  type RadioGroupProps,
  type RadioOption,
} from "./ui/select";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./ui/segmented-control";
export {
  Table,
  TableScroll,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
  Pagination,
  type TableProps,
  type TableRowProps,
  type PaginationProps,
} from "./ui/table";
export {
  Dialog,
  DialogContent,
  DialogFooter,
  Drawer,
  DrawerContent,
  Tooltip,
  TooltipProvider,
  type DialogProps,
  type DialogContentProps,
  type DrawerProps,
  type DrawerContentProps,
  type TooltipProps,
} from "./ui/overlay";
export { Tabs, TabPanel, TabbedPanels, type TabItem, type TabsProps } from "./ui/tabs";
export { toast, Toaster, ToastGlyph, type ToastTone, type ToastOptions } from "./ui/toast";

/* ─── State library ─────────────────────────────────────────────────── */

export {
  Skeleton,
  SkeletonText,
  Spinner,
  LoadingState,
  EmptyState,
  ErrorState,
  OfflineState,
  ForbiddenState,
  DegradedState,
  PartialBanner,
  StaleBanner,
  SectionShell,
  StateView,
  type ViewState,
  type SkeletonProps,
} from "./ui/states";

/* ─── Brand ─────────────────────────────────────────────────────────── */

export {
  LogoEmblem,
  LogoWordmark,
  LogoLockup,
  LogoStacked,
  LogoCompact,
  BrandMark,
  type LogoProps,
  type LockupProps,
  type WordmarkProps,
} from "./brand/logo";
export {
  Glyph,
  Icon,
  GLYPHS,
  ICONS,
  type GlyphName,
  type IconName,
  type GlyphProps,
} from "./brand/glyphs";
export {
  SignalPrism,
  detectPrismTier,
  type SignalPrismProps,
  type PrismTier,
} from "./brand/signal-prism";
export {
  ConvergenceLoader,
  BrandTransition,
  BootSplash,
  BrandSpinner,
  type ConvergenceLoaderProps,
} from "./brand/loader";

/* ─── Domain components ─────────────────────────────────────────────── */

export {
  VentureCard,
  VentureCardSkeleton,
  FounderCard,
  EvidenceCard,
  SignalTimeline,
  type VentureCardData,
  type VentureCardProps,
  type FounderCardData,
  type FounderIdentityLink,
  type FounderPassportEvent,
  type EvidenceCardData,
  type TimelineEntry,
} from "./domain/venture";
export {
  RepositoryPanel,
  RepositoryPanelSkeleton,
  ContributorShare,
  type RepositoryPanelData,
  type RepoMeta,
  type RepoContributor,
  type RepoRelease,
  type RepoCommit,
} from "./domain/repository";
export {
  Sparkline,
  LineChart,
  AreaChart,
  BarSeries,
  ChartDataTable,
  ChartSkeleton,
  type SparklineProps,
  type LineChartProps,
  type Series,
  type SeriesPoint,
  type BarDatum,
} from "./domain/charts";
export {
  EvidenceGraph,
  FounderGraph,
  GRAPH_NODE_META,
  GRAPH_RELATION_LABEL,
  type EvidenceGraphProps,
  type FounderGraphProps,
  type GraphNode,
  type GraphEdge,
  type GraphNodeKind,
  type FounderGraphNode,
  type FounderGraphEdge,
} from "./domain/graphs";
export {
  TokenCard,
  TokenCardSkeleton,
  TokenMintLine,
  type TokenCardProps,
  type TokenStructure,
  type MarketSnapshot,
} from "./domain/token";
export {
  ResearchComposer,
  RunStatusStrip,
  DEFAULT_SUGGESTIONS,
  type ResearchComposerProps,
  type ResearchRunStatus,
  type SuggestedQuestion,
} from "./domain/research";
export {
  ResearchReport,
  ResearchReportSkeleton,
  type ResearchReportData,
  type ResearchReportProps,
  type ReportSection,
  type ReportCitation,
} from "./domain/report";
export {
  TradePanel,
  TradeGateNotice,
  useNow,
  quotePriceLabel,
  type TradePanelProps,
  type TradingReadiness,
  type TradeGateState,
  type TradeGateCondition,
  type QuotePreview,
  type OrderIntent,
} from "./domain/trade";

/* ─── Motion ────────────────────────────────────────────────────────── */

export {
  motion,
  easeCss,
  transition,
  useMotionOK,
  useMotionDuration,
  useVariant,
  variants,
  VARIANT_CLASS,
  interaction,
  type MotionDuration,
  type MotionEase,
  type VariantName,
} from "@/lib/fs/motion";

/* ─── Utilities ─────────────────────────────────────────────────────── */

export {
  cn,
  formatCompact,
  formatUsd,
  formatPct,
  timeAgo,
  shortHash,
  initials,
  hueFromString,
  debounce,
  type DebouncedFn,
} from "@/lib/fs/utils";

/* ─── Theme ─────────────────────────────────────────────────────────── */

export {
  ThemeToggle,
  ThemeMenuItems,
  useFsTheme,
  MotionToggle,
  type ThemeName,
} from "./theme";
import type { AccountState } from "./api";
import type { Section } from "./routes";

const PERSONAS = {
  VENTURE_INVESTOR: { title: "Investor / VC workspace", description: "Build a diligence pipeline from verified evidence, not pitch claims.", priorities: ["discover", "watchlists", "research", "markets"] },
  FOUNDER: { title: "Founder workspace", description: "Review your public evidence footprint and research comparable ventures. A founder preference does not establish venture ownership.", priorities: ["discover", "research", "watchlists", "markets"] },
  RESEARCH_ANALYST: { title: "Analyst workspace", description: "Continue evidence reviews, inspect citations, and monitor changes across your coverage.", priorities: ["research", "watchlists", "discover", "markets"] },
  LIMITED_PARTNER: { title: "LP workspace", description: "Review shared diligence and monitor tracked ventures. Watchlists are not verified fund holdings or performance.", priorities: ["watchlists", "research", "markets", "discover"] },
  OTHER: { title: "Research workspace", description: "Explore ventures, read evidence-grounded research, and follow the signals that matter to you.", priorities: ["discover", "markets", "research", "watchlists"] },
} satisfies Record<string, { title: string; description: string; priorities: Section[] }>;

export type WorkspacePersona = keyof typeof PERSONAS;

/** Presentation only. API authorization and entitlement checks remain authoritative. */
export function getRoleWorkspace(account: Pick<AccountState, "userType" | "platformRole" | "workspaceRole">) {
  const persona: WorkspacePersona = Object.prototype.hasOwnProperty.call(PERSONAS, account.userType)
    ? account.userType as WorkspacePersona
    : "OTHER";
  const canEditWorkspace = ["OWNER", "ADMIN", "ANALYST"].includes(account.workspaceRole);
  const canManageWorkspace = ["OWNER", "ADMIN"].includes(account.workspaceRole);
  const canModerate = ["PLATFORM_ADMIN", "MODERATOR"].includes(account.platformRole);
  return {
    persona,
    ...PERSONAS[persona],
    canEditWorkspace,
    canManageWorkspace,
    canModerate,
    navigation: ["dashboard", ...PERSONAS[persona].priorities, "settings", ...(canModerate ? ["admin"] : [])] as Section[],
  };
}
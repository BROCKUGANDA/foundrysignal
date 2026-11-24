import { describe, expect, test } from "bun:test";
import { getRoleWorkspace } from "../src/lib/client/role-workspace";
import { pathToSection, sectionToPath } from "../src/lib/client/routes";

const account = { userType: "OTHER", platformRole: "USER", workspaceRole: "VIEWER" };

describe("role workspace", () => {
  test("personas have distinct priorities without hiding readable research", () => {
    const titles = new Set<string>();
    for (const userType of ["VENTURE_INVESTOR", "FOUNDER", "RESEARCH_ANALYST", "LIMITED_PARTNER", "OTHER"]) {
      const workspace = getRoleWorkspace({ ...account, userType });
      expect(workspace.persona).toBe(userType);
      titles.add(workspace.title);
      for (const section of ["discover", "research", "watchlists", "markets", "settings"]) {
        expect(workspace.navigation).toContain(section);
      }
      expect(workspace.canEditWorkspace).toBe(false);
      expect(workspace.canManageWorkspace).toBe(false);
      expect(workspace.navigation).not.toContain("admin");
    }
    expect(titles.size).toBe(5);
    expect(getRoleWorkspace({ ...account, userType: "RESEARCH_ANALYST" }).priorities[0]).toBe("research");
    expect(getRoleWorkspace({ ...account, userType: "LIMITED_PARTNER" }).priorities[0]).toBe("watchlists");
  });

  test("only server roles expose privileged actions", () => {
    for (const workspaceRole of ["OWNER", "ADMIN", "ANALYST", "VIEWER", "UNKNOWN"]) {
      const workspace = getRoleWorkspace({ ...account, workspaceRole });
      expect(workspace.canEditWorkspace).toBe(["OWNER", "ADMIN", "ANALYST"].includes(workspaceRole));
      expect(workspace.canManageWorkspace).toBe(["OWNER", "ADMIN"].includes(workspaceRole));
      expect(workspace.canModerate).toBe(false);
    }
    for (const platformRole of ["PLATFORM_ADMIN", "MODERATOR"]) {
      const workspace = getRoleWorkspace({ ...account, platformRole });
      expect(workspace.navigation).toContain("admin");
      expect(workspace.canEditWorkspace).toBe(false);
      expect(workspace.canManageWorkspace).toBe(false);
    }
  });

  test("unknown and malicious preferences fail closed", () => {
    for (const userType of ["UNKNOWN", "OWNER", "PLATFORM_ADMIN", "__proto__", "constructor", ""]) {
      const workspace = getRoleWorkspace({ ...account, userType, workspaceRole: "UNKNOWN", platformRole: "UNKNOWN" });
      expect(workspace.persona).toBe("OTHER");
      expect(workspace.canEditWorkspace || workspace.canManageWorkspace || workspace.canModerate).toBe(false);
    }
  });

  test("dashboard deep links round trip", () => {
    expect(sectionToPath("dashboard")).toBe("/dashboard");
    expect(pathToSection("/dashboard", "")?.section).toBe("dashboard");
  });
});
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { readWorkspace, type Project } from "@/lib/workspace";
import {
  errorMessage,
  type WorkspaceCatalog,
  type WorkspaceSelection,
} from "@/lib/desktop";

type BrowserStore = { catalog: WorkspaceCatalog; data: Record<string, Project[]> };
const browserKey = "captura-desk-workspaces-v1";
function readBrowser(): BrowserStore {
  const raw = localStorage.getItem(browserKey);
  if (raw) {
    const data = JSON.parse(raw) as BrowserStore;
    if (
      !data.catalog?.workspaces?.length ||
      !Array.isArray(data.data?.[data.catalog.activeId])
    )
      throw Error("Workspace data could not be read.");
    return data;
  }
  return {
    catalog: {
      activeId: "personal",
      workspaces: [{ id: "personal", name: "Personal workspace" }],
    },
    data: { personal: readWorkspace() },
  };
}
export function useWorkspace() {
  const [selection, setSelection] = useState<WorkspaceSelection>({
    catalog: {
      activeId: "personal",
      workspaces: [{ id: "personal", name: "Personal workspace" }],
    },
    projects: [],
  });
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const switching = useRef(false);
  const chain = useRef(Promise.resolve());
  const current = useRef(selection);
  current.current = selection;
  useEffect(() => {
    let canceled = false;
    async function load() {
      if (window.desktop) {
        const projects =
          (await window.desktop.loadWorkspace()) ??
          (await window.desktop.initializeWorkspace(readWorkspace()));
        return { projects, catalog: await window.desktop.listWorkspaces() };
      }
      const browser = readBrowser();
      return {
        catalog: browser.catalog,
        projects: browser.data[browser.catalog.activeId],
      };
    }
    load()
      .then((data) => {
        if (!canceled) {
          setSelection(data);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!canceled) setError(errorMessage(e));
      });
    return () => {
      canceled = true;
    };
  }, []);
  async function persist(snapshot: WorkspaceSelection) {
    if (window.desktop)
      await window.desktop.saveWorkspace(snapshot.catalog.activeId, snapshot.projects);
    else {
      const browser = readBrowser();
      browser.data[snapshot.catalog.activeId] = snapshot.projects;
      localStorage.setItem(browserKey, JSON.stringify(browser));
    }
  }
  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    let canceled = false;
    // Each queued save carries its workspace ID; switching never redirects it.
    chain.current = chain.current.catch(() => {}).then(() => persist(selection));
    chain.current
      .then(() => {
        if (!canceled) {
          setSaved(true);
          setError("");
        }
      })
      .catch((e) => {
        if (!canceled) setError(errorMessage(e));
      });
    return () => {
      canceled = true;
    };
  }, [selection, ready]);
  const setProjects = (value: SetStateAction<Project[]>) =>
    setSelection((s) => ({
      ...s,
      projects: typeof value === "function" ? value(s.projects) : value,
    }));
  async function flush() {
    await chain.current;
    await persist(current.current);
  }
  async function mutate(action: () => Promise<WorkspaceSelection>) {
    if (switching.current) throw Error("A workspace change is already in progress.");
    switching.current = true;
    setBusy(true);
    try {
      await flush();
      const data = await action();
      current.current = data;
      setSelection(data);
      setError("");
      return data;
    } finally {
      switching.current = false;
      setBusy(false);
    }
  }
  async function switchWorkspace(id: string) {
    return mutate(async () => {
      if (window.desktop) return window.desktop.selectWorkspace(id);
      const browser = readBrowser();
      if (!browser.catalog.workspaces.some((w) => w.id === id))
        throw Error("Workspace not found");
      browser.catalog.activeId = id;
      localStorage.setItem(browserKey, JSON.stringify(browser));
      return { catalog: browser.catalog, projects: browser.data[id] };
    });
  }
  async function createWorkspace(name: string) {
    return mutate(async () => {
      if (window.desktop) return window.desktop.createWorkspace(name);
      const browser = readBrowser();
      name = name.trim();
      if (!name || name.length > 80)
        throw Error("Enter a workspace name (up to 80 characters).");
      if (
        browser.catalog.workspaces.some(
          (w) => w.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error("A workspace with that name already exists.");
      const id = crypto.randomUUID();
      browser.catalog.workspaces.push({ id, name });
      browser.catalog.activeId = id;
      browser.data[id] = [];
      localStorage.setItem(browserKey, JSON.stringify(browser));
      return { catalog: browser.catalog, projects: [] };
    });
  }
  async function renameWorkspace(id: string, name: string) {
    await mutate(async () => {
      if (window.desktop) return window.desktop.renameWorkspace(id, name);
      const browser = readBrowser();
      name = name.trim();
      if (!name || name.length > 80)
        throw Error("Enter a workspace name (up to 80 characters).");
      if (
        browser.catalog.workspaces.some(
          (w) => w.id !== id && w.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error("A workspace with that name already exists.");
      const workspace = browser.catalog.workspaces.find((w) => w.id === id);
      if (!workspace) throw Error("Workspace not found");
      workspace.name = name;
      localStorage.setItem(browserKey, JSON.stringify(browser));
      return {
        catalog: browser.catalog,
        projects: browser.data[browser.catalog.activeId],
      };
    });
  }
  async function deleteWorkspace(id: string) {
    let cleanupPending = false;
    await mutate(async () => {
      if (window.desktop) {
        const result = await window.desktop.deleteWorkspace(id);
        cleanupPending = result.cleanupPending;
        return result;
      }
      const browser = readBrowser();
      if (!browser.catalog.workspaces.some((w) => w.id === id))
        throw Error("Workspace not found");
      const remaining = browser.catalog.workspaces.filter((w) => w.id !== id);
      if (!remaining.length)
        throw Error("Create another workspace before deleting your last workspace.");
      browser.catalog.workspaces = remaining;
      delete browser.data[id];
      if (browser.catalog.activeId === id) browser.catalog.activeId = remaining[0].id;
      localStorage.setItem(browserKey, JSON.stringify(browser));
      return {
        catalog: browser.catalog,
        projects: browser.data[browser.catalog.activeId],
      };
    });
    return cleanupPending;
  }
  async function deleteProject(projectId: string) {
    let cleanupPending = false;
    await mutate(async () => {
      const snapshot = current.current;
      if (window.desktop) {
        const result = await window.desktop.deleteProject(
          snapshot.catalog.activeId,
          projectId,
        );
        cleanupPending = result.cleanupPending;
        return { ...snapshot, projects: result.projects };
      }
      const projects = snapshot.projects.filter((p) => p.id !== projectId);
      await persist({ ...snapshot, projects });
      return { ...snapshot, projects };
    });
    return cleanupPending;
  }
  async function deleteDocument(projectId: string, guideId: string) {
    await mutate(async () => {
      const snapshot = current.current;
      if (!window.desktop) throw new Error("Document deletion requires the desktop app.");
      const result = await window.desktop.deleteDocument(
        snapshot.catalog.activeId,
        projectId,
        guideId,
      );
      return { ...snapshot, projects: result.projects };
    });
  }
  async function deleteRecording(projectId: string, guideId: string) {
    let cleanupPending = false;
    await mutate(async () => {
      const snapshot = current.current;
      if (window.desktop) {
        const result = await window.desktop.deleteRecording(
          snapshot.catalog.activeId,
          projectId,
          guideId,
        );
        cleanupPending = result.cleanupPending;
        return { ...snapshot, projects: result.projects };
      }
      const projects = snapshot.projects.map((p) =>
        p.id === projectId
          ? { ...p, documents: p.documents.filter((d) => d.id !== guideId) }
          : p,
      );
      await persist({ ...snapshot, projects });
      return { ...snapshot, projects };
    });
    return cleanupPending;
  }
  return {
    projects: selection.projects,
    setProjects,
    workspaceId: selection.catalog.activeId,
    workspaces: selection.catalog.workspaces,
    ready,
    saved,
    error,
    flush,
    busy,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    deleteProject,
    deleteRecording,
    deleteDocument,
  };
}

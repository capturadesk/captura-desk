import { ManageSteps } from "@/components/manage-steps";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  PanelLeft,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AIProviderSettings } from "@/components/ai-provider-settings";
import { AIGenerateDialog } from "@/components/ai-generate-dialog";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CaptureView } from "@/components/capture-view";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRecording } from "@/hooks/use-recording";
import { errorMessage, type DisplaySource, type RecordingResult } from "@/lib/desktop";
import { defaultInstructions, markdown, type Guide, type Project } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type Modal = "project" | "instructions" | "record" | "help" | null;
export default function App() {
  const {
    projects,
    setProjects,
    ready,
    saved,
    error: storageError,
    flush,
    workspaceId,
    workspaces,
    busy: workspaceBusy,
    backupWorkspace,
    restoreWorkspace,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    deleteProject: removeProject,
    deleteRecording: removeRecording,
    deleteDocument: removeDocument,
  } = useWorkspace();
  const {
    state: recorder,
    error: recorderError,
    busy: recorderBusy,
    action: recordAction,
  } = useRecording();
  const recording = recorder.status !== "idle";
  const paused = recorder.status === "paused";
  const [displays, setDisplays] = useState<DisplaySource[]>([]);
  const [displayId, setDisplayId] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [aiSettings, setAISettings] = useState(false);
  const [aiGenerate, setAIGenerate] = useState(false);
  const [manageSteps, setManageSteps] = useState(false);
  const [aiEdit, setAIEdit] = useState("");
  const [renameRevision, setRenameRevision] = useState(false);
  const [revisionName, setRevisionName] = useState("");
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? "");
  const [guideId, setGuideId] = useState<string | null>(
    () => projects[0]?.documents[0]?.id ?? null,
  );
  const [view, setView] = useState<"editor" | "projects">("editor");
  const [tab, setTab] = useState("document");
  const [stepIndex, setStepIndex] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [formName, setFormName] = useState("");
  const [formText, setFormText] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [refinement, setRefinement] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [undo, setUndo] = useState<Guide | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === projectId) ??
    projects[0] ?? { id: "", name: "", description: "", instructions: "", documents: [] };
  const showProjects = view === "projects" || !projects.length;
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [recordingDeleteTarget, setRecordingDeleteTarget] = useState<{
    projectId: string;
    guide: Guide;
  } | null>(null);
  const guide = project.documents.find((d) => d.id === guideId) ?? project.documents[0];
  const step = guide?.steps[stepIndex];

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4200);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording, paused]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setView("projects");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => window.desktop?.onRecordingFinished(finishRecording), [workspaceId]);
  useEffect(() => {
    if (modal !== "record" || !window.desktop) return;
    let canceled = false;
    setStartError("");
    window.desktop
      .listDisplays()
      .then((list) => {
        if (!canceled) {
          setDisplays(list);
          setDisplayId(
            list.find((display) => display.recommended)?.id ?? list[0]?.id ?? "",
          );
        }
      })
      .catch((e) => {
        if (!canceled) setStartError(errorMessage(e));
      });
    return () => {
      canceled = true;
    };
  }, [modal]);
  function updateProject(change: Partial<Project>) {
    setProjects((all) => all.map((p) => (p.id === project.id ? { ...p, ...change } : p)));
  }
  function updateGuide(change: Partial<Guide>) {
    if (!guide) return;
    updateProject({
      documents: project.documents.map((d) =>
        d.id === guide.id ? { ...d, ...change } : d,
      ),
    });
  }
  function updateStep(change: Partial<NonNullable<typeof step>>) {
    if (!guide || !step) return;
    updateGuide({
      steps: guide.steps.map((s, i) => (i === stepIndex ? { ...s, ...change } : s)),
    });
  }
  function resetNavigation() {
    setView("projects");
    setProjectId("");
    setGuideId(null);
    setStepIndex(0);
    setUndo(null);
    setSearch("");
    setRefinement("");
    setConfirmDelete(false);
    setModal(null);
  }
  async function selectWorkspace(id: string) {
    await switchWorkspace(id);
    resetNavigation();
  }
  async function addWorkspace(name: string) {
    await createWorkspace(name);
    resetNavigation();
  }
  async function confirmProjectDeletion() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const pending = await removeProject(deleteTarget.id);
      setDeleteTarget(null);
      resetNavigation();
      setMessage(
        pending
          ? "Project deleted. Some locked capture files will be retried on next launch."
          : "Project and its captures deleted.",
      );
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }
  function projectMenu(p: Project) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Project options for ${p.name}`}
            className="size-7 text-neutral-500"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={recording}
            className="text-red-600"
            onSelect={() => {
              setDeleteError("");
              setDeleteTarget(p);
            }}
          >
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  const deletingRevision =
    !!recordingDeleteTarget?.guide.sessionId &&
    recordingDeleteTarget.guide.id !== recordingDeleteTarget.guide.sessionId;
  async function confirmRecordingDeletion() {
    if (!recordingDeleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const pending = deletingRevision
        ? (await removeDocument(
            recordingDeleteTarget.projectId,
            recordingDeleteTarget.guide.id,
          ),
          false)
        : await removeRecording(
            recordingDeleteTarget.projectId,
            recordingDeleteTarget.guide.id,
          );
      setRecordingDeleteTarget(null);
      setGuideId(null);
      setStepIndex(0);
      setUndo(null);
      setMessage(
        deletingRevision
          ? "Document deleted. Original recording and screenshots kept."
          : pending
            ? "Recording deleted. Locked capture files will be retried on next launch."
            : "Recording and its captures deleted.",
      );
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }
  function openProject(p: Project) {
    setProjectId(p.id);
    setGuideId(p.documents[0]?.id ?? null);
    setView("editor");
    setStepIndex(0);
    setTab("document");
    setUndo(null);
  }
  function openModal(value: Modal) {
    setFormName(value === "instructions" ? project.name : "");
    setFormText(value === "instructions" ? project.instructions : "");
    setModal(value);
  }
  function saveProject() {
    if (!formName.trim()) return;
    if (modal === "project") {
      const p: Project = {
        id: crypto.randomUUID(),
        name: formName.trim(),
        description: "Your next workflow starts here.",
        instructions: formText.trim() || defaultInstructions,
        documents: [],
      };
      setProjects((all) => [...all, p]);
      openProject(p);
    } else updateProject({ name: formName.trim(), instructions: formText.trim() });
    setModal(null);
    setMessage("Project saved");
  }
  async function exportGuide() {
    if (!guide) return;
    try {
      if (window.desktop) {
        await flush();
        if (
          await window.desktop.exportMarkdown({
            projectId: project.id,
            guideId: guide.id,
          })
        )
          setMessage("Document exported");
      } else {
        const url = URL.createObjectURL(
          new Blob([markdown(guide)], { type: "text/markdown" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${guide.title.replace(/[^a-z0-9 -]/gi, "") || "guide"}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Document exported");
      }
    } catch {
      setMessage("Export failed. Please try again.");
    }
  }
  async function startRecording() {
    if (!formName.trim() || !window.desktop || !displayId || starting) return;
    setStarting(true);
    setStartError("");
    try {
      await flush();
      await window.desktop.startRecording({
        projectId: project.id,
        name: formName.trim(),
        context: formText,
        displayId,
      });
      setSeconds(0);
      setModal(null);
    } catch (e) {
      setStartError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }
  function finishRecording(result: RecordingResult) {
    setProjects(result.projects);
    setProjectId(result.projectId);
    setGuideId(result.sessionId);
    setStepIndex(0);
    setTab("captures");
    setView("editor");
    setUndo(null);
    setMessage("Recording saved. Review your captured steps.");
  }
  function refine() {
    if (!guide || !refinement.trim()) return;
    if (!guide.demo) {
      setAIEdit(refinement.trim());
      return;
    }
    const q = refinement.toLowerCase();
    let change: Partial<Guide>;
    if (q.includes("checklist"))
      change = {
        steps: guide.steps.map((s) => ({
          ...s,
          title: s.title.startsWith("☐ ") ? s.title : `☐ ${s.title}`,
        })),
      };
    else if (q.includes("short") || q.includes("concise"))
      change = {
        description: "Investigate the payment, resolve the issue, and verify its status.",
        steps: guide.steps.map((s) => ({
          ...s,
          description: s.description.split(". ")[0].replace(/\.$/, "") + ".",
        })),
      };
    else {
      setMessage("This UI demo supports “Make it shorter” and “Turn into a checklist”.");
      return;
    }
    setUndo(structuredClone(guide));
    updateGuide(change);
    setRefinement("");
    setMessage("Sample revision applied. You can undo this change.");
  }
  function deleteStep() {
    if (!guide) return;
    setUndo(structuredClone(guide));
    updateGuide({ steps: guide.steps.filter((_, i) => i !== stepIndex) });
    setStepIndex(Math.max(0, stepIndex - 1));
    setConfirmDelete(false);
    setMessage("Step removed. Undo is available.");
  }
  const IconButton = ({
    label,
    onClick,
    children,
  }: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-neutral-500"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  if (!ready)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        {storageError ? (
          <div role="alert">
            Could not load your workspace: {storageError}
            <Button className="ml-4" onClick={() => location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          "Loading workspace…"
        )}
      </div>
    );
  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full flex-col text-[13px]" inert={workspaceBusy}>
        {(storageError || recorderError || recorder.error) && (
          <div role="alert" className="bg-red-50 px-6 py-2 text-xs text-red-700">
            {storageError || recorderError || recorder.error}
          </div>
        )}
        <header className="titlebar flex h-10 shrink-0 items-center gap-2 border-b bg-[#fafafa] px-4 pr-40 text-[11px] text-neutral-500">
          <span className="flex size-4 items-center justify-center rounded bg-neutral-800 text-white">
            <MousePointer2 size={10} />
          </span>
          <span className="font-medium text-neutral-700">Captura Desk</span>
          <span className="mx-auto text-[10px]">
            {showProjects ? "Your workspace" : project.name}
          </span>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="app-sidebar flex w-[222px] shrink-0 flex-col border-r bg-[#fafafa] px-3 py-5">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeId={workspaceId}
              disabled={recording || workspaceBusy}
              onBackup={backupWorkspace}
              onRestore={async () => {
                const restored = await restoreWorkspace();
                if (restored) {
                  resetNavigation();
                  setMessage("Backup restored into a separate workspace.");
                }
                return restored;
              }}
              onSelect={selectWorkspace}
              onCreate={addWorkspace}
              onRename={renameWorkspace}
              onDelete={async (id) => {
                const pending = await deleteWorkspace(id);
                resetNavigation();
                setMessage(
                  pending
                    ? "Workspace deleted. Locked capture files will be retried on next launch."
                    : "Workspace and its captures deleted.",
                );
              }}
            />
            <button
              className="sidebar-link mb-1"
              onClick={() => {
                setView("projects");
                setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              <Search />
              <span className="flex-1">Search</span>
              <kbd className="rounded border bg-white px-1 text-[9px] text-neutral-400">
                Ctrl K
              </kbd>
            </button>
            <button
              className={cn("sidebar-link", showProjects && "active")}
              onClick={() => setView("projects")}
            >
              <LayoutGrid />
              All projects
              <span className="ml-auto text-[10px] text-neutral-400">
                {projects.length}
              </span>
            </button>
            <div className="mb-2 mt-8 flex items-center justify-between px-2 text-[10px] font-medium text-neutral-400">
              <span>PROJECTS</span>
              <IconButton label="New project" onClick={() => openModal("project")}>
                <Plus className="size-3.5" />
              </IconButton>
            </div>
            <div className="scrollbar min-h-0 flex-1 overflow-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={cn(
                    "sidebar-link mb-1",
                    view === "editor" && p.id === project.id && "active",
                  )}
                  onClick={() => openProject(p)}
                >
                  <Folder />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1 pt-5">
              <button
                className="sidebar-link disabled:opacity-40"
                disabled={recording || workspaceBusy}
                onClick={() => setAISettings(true)}
              >
                <Sparkles />
                AI providers
              </button>
              <button
                className="sidebar-link disabled:opacity-40"
                disabled={!project.id}
                onClick={() => openModal("instructions")}
              >
                <Settings2 />
                Project instructions
              </button>
              <button className="sidebar-link" onClick={() => openModal("help")}>
                <CircleHelp />
                About this preview
              </button>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 px-2 text-[10px] text-neutral-400">
              <span className="size-1.5 rounded-full bg-neutral-400" />
              Local recorder<span className="ml-auto">v0.2</span>
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[57px] shrink-0 items-center gap-3 border-b px-7">
              <PanelLeft className="size-4 text-neutral-400" />
              <span className="h-3 border-l" />
              <button
                className="text-xs text-neutral-500 hover:text-neutral-900"
                onClick={() => setView("projects")}
              >
                Projects
              </button>
              {view === "editor" && (
                <>
                  <ChevronRight className="size-3 text-neutral-300" />
                  <span className="truncate text-xs">{project.name}</span>
                </>
              )}
              <span className="flex-1" />
              {guide && !guide.demo && view === "editor" && window.desktop && (
                <Button
                  size="sm"
                  disabled={
                    recording || workspaceBusy || !guide.steps.some((s) => s.captureId)
                  }
                  onClick={() => setAIGenerate(true)}
                >
                  <Sparkles className="size-3.5" />
                  Generate documentation
                </Button>
              )}
              {guide && view === "editor" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-2 text-[11px] shadow-none"
                  onClick={exportGuide}
                >
                  <ArrowDownToLine className="size-3.5" />
                  Export
                </Button>
              )}
            </div>
            {showProjects ? (
              <div className="scrollbar flex-1 overflow-auto p-10">
                <div className="mx-auto max-w-5xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight">
                        Your projects
                      </h1>
                      <p className="mt-2 text-xs text-neutral-500">
                        A place for the things you know how to do.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openModal("project")}>
                      <Plus />
                      New project
                    </Button>
                  </div>
                  <div className="relative mb-7 mt-9 max-w-xs">
                    <Search className="absolute left-3 top-2.5 size-4 text-neutral-400" />
                    <Input
                      ref={searchRef}
                      aria-label="Search projects"
                      placeholder="Search projects…"
                      className="h-9 pl-9 text-xs"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    {projects
                      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                      .map((p) => (
                        <div key={p.id} className="relative rounded-lg border">
                          <div className="absolute right-3 top-3">{projectMenu(p)}</div>
                          <button
                            onClick={() => openProject(p)}
                            className="group w-full rounded-lg p-6 text-left transition-colors hover:bg-neutral-50"
                          >
                            <FolderOpen className="mb-7 size-5 text-neutral-400" />
                            <h2 className="font-medium">{p.name}</h2>
                            <p className="mt-2 min-h-10 text-xs leading-5 text-neutral-500">
                              {p.description}
                            </p>
                            <div className="mt-6 flex items-center text-[10px] text-neutral-400">
                              <span>
                                {p.documents.length}{" "}
                                {p.documents.length === 1 ? "document" : "documents"}
                              </span>
                              <ArrowRight className="ml-auto size-3.5 transition-transform group-hover:translate-x-1" />
                            </div>
                          </button>
                        </div>
                      ))}
                  </div>
                  {!projects.some((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  ) && (
                    <p className="py-12 text-center text-neutral-500">
                      {projects.length
                        ? `No projects match “${search}”.`
                        : "This workspace is empty. Create your first project to get started."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="shrink-0 px-8 pt-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-[23px] font-semibold tracking-[-.7px]">
                        {project.name}
                      </h1>
                      <p className="mt-1.5 text-xs text-neutral-500">
                        {project.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {projectMenu(project)}
                      <Button
                        size="sm"
                        className="mt-1 h-8 text-[11px]"
                        disabled={recording}
                        onClick={() => openModal("record")}
                      >
                        <Plus className="size-3.5" />
                        New recording
                      </Button>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center border-b pb-2">
                    <Tabs value={tab} onValueChange={setTab}>
                      <TabsList className="h-8 bg-neutral-100 p-0.5">
                        <TabsTrigger value="document" className="gap-2 px-3 text-[11px]">
                          Document
                          <FileText className="size-3" />
                        </TabsTrigger>
                        <TabsTrigger value="captures" className="gap-2 px-3 text-[11px]">
                          Captures
                          <span className="text-[10px] text-neutral-400">
                            {guide?.steps.length ?? 0}
                          </span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <span className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-neutral-500"
                      onClick={() => openModal("instructions")}
                    >
                      <Settings2 className="size-3.5" />
                      Instructions
                    </Button>
                  </div>
                </div>
                {!guide ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
                    <div className="mb-5 flex size-12 items-center justify-center rounded-xl border bg-neutral-50">
                      <MousePointer2 className="size-5 text-neutral-500" />
                    </div>
                    <h2 className="text-lg font-medium">
                      Your first workflow starts here
                    </h2>
                    <p className="mt-2 max-w-xs text-xs leading-6 text-neutral-500">
                      Set your documentation instructions, then record a task to turn it
                      into a step-by-step guide.
                    </p>
                    <Button
                      className="mt-6"
                      size="sm"
                      disabled={recording}
                      onClick={() => openModal("record")}
                    >
                      <Plus />
                      New recording
                    </Button>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1">
                    <div className="scrollbar min-w-0 flex-1 overflow-y-auto bg-[#fcfcfc] px-8 pb-8 pt-4">
                      <div className="mx-auto max-w-[780px]">
                        <div className="mb-4 flex h-6 items-center gap-2 text-[10px] text-neutral-400">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex max-w-[65%] items-center gap-1.5 text-neutral-500">
                                <FileText className="size-3.5 shrink-0" />
                                <span className="truncate">
                                  {guide.revision
                                    ? `Revision ${guide.revision} · ${guide.revisionLabel}`
                                    : guide.title}
                                </span>
                                <ChevronDown className="size-3 shrink-0" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {project.documents.map((d) => (
                                <DropdownMenuItem
                                  key={d.id}
                                  onClick={() => {
                                    setGuideId(d.id);
                                    setStepIndex(0);
                                    setUndo(null);
                                  }}
                                >
                                  <span className="flex min-w-0 flex-col">
                                    <span>
                                      {d.revision
                                        ? `Revision ${d.revision} · ${d.revisionLabel}`
                                        : d.title}
                                    </span>
                                    {d.sessionId && (
                                      <span className="text-[10px] text-neutral-500">
                                        {d.revision ? d.title : "Original"}
                                        {d.createdAt
                                          ? " · " + new Date(d.createdAt).toLocaleString()
                                          : ""}
                                      </span>
                                    )}
                                  </span>
                                  {d.id === guide.id && (
                                    <Check className="ml-auto size-3" />
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="flex-1" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Recording options"
                                disabled={recording || workspaceBusy}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!!guide.revision && (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setRevisionName(guide.revisionLabel || "AI draft");
                                    setRenameRevision(true);
                                  }}
                                >
                                  Rename revision
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteError("");
                                  setRecordingDeleteTarget({
                                    projectId: project.id,
                                    guide,
                                  });
                                }}
                              >
                                <Trash2 className="size-4" />{" "}
                                {guide.sessionId && guide.id !== guide.sessionId
                                  ? "Delete document"
                                  : "Delete recording"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {saved ? (
                            <>
                              <Check className="size-3" />
                              Saved on this device
                            </>
                          ) : (
                            <span className="text-amber-700">Saving changes…</span>
                          )}
                        </div>
                        {guide.sessionId && (
                          <p className="mb-4 text-xs text-neutral-500">
                            {guide.revision ? `Revision ${guide.revision}` : "Original"}
                            {guide.createdAt
                              ? " · " + new Date(guide.createdAt).toLocaleString()
                              : ""}
                            {guide.basedOnRevision !== undefined
                              ? guide.basedOnRevision === 0
                                ? " · Based on Original"
                                : ` · Based on Revision ${guide.basedOnRevision}`
                              : ""}
                          </p>
                        )}
                        {tab === "document" ? (
                          <>
                            <article className="document-sheet rounded-lg border bg-white px-11 py-9 shadow-[0_2px_8px_#00000002]">
                              <div className="mb-5 flex items-center gap-2 text-[10px] text-neutral-400">
                                <Badge
                                  variant="secondary"
                                  className="rounded px-1.5 py-0 text-[9px] font-normal"
                                >
                                  Procedure
                                </Badge>
                                <span>/</span>
                                <span>
                                  {guide.demo
                                    ? "Sample workflow"
                                    : guide.recovered
                                      ? "Recovered recording"
                                      : "Local recording"}
                                </span>
                              </div>
                              <Input
                                aria-label="Document title"
                                value={guide.title}
                                onChange={(e) => updateGuide({ title: e.target.value })}
                                className="doc-input -ml-1 h-auto px-1 py-1 !text-[27px] font-semibold tracking-[-.8px] shadow-none focus-visible:ring-1"
                              />
                              <Textarea
                                aria-label="Document description"
                                value={guide.description}
                                onChange={(e) =>
                                  updateGuide({ description: e.target.value })
                                }
                                className="doc-input -ml-1 mt-2 min-h-[58px] px-1 py-1 text-xs leading-6 text-neutral-500 shadow-none focus-visible:ring-1"
                              />
                              <div className="mb-7 mt-4 flex gap-5 text-[10px] text-neutral-400">
                                <span className="flex items-center gap-1.5">
                                  <Clock3 className="size-3" />
                                  {Math.max(1, Math.ceil(guide.steps.length / 2))} min
                                  read
                                </span>
                                <span>{guide.steps.length} steps</span>
                                <span>Draft</span>
                              </div>
                              <Separator className="mb-7" />
                              {step ? (
                                <>
                                  <div className="mb-5 flex items-center gap-3">
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] text-neutral-500">
                                      {stepIndex + 1}
                                    </span>
                                    <Input
                                      aria-label="Step title"
                                      className="doc-input h-8 px-1 text-sm font-medium shadow-none focus-visible:ring-1"
                                      value={step.title}
                                      onChange={(e) =>
                                        updateStep({ title: e.target.value })
                                      }
                                    />
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          aria-label="Step options"
                                          variant="ghost"
                                          size="icon"
                                          className="size-7 text-neutral-400"
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          className="text-red-600"
                                          onClick={() => setConfirmDelete(true)}
                                        >
                                          <Trash2 />
                                          Remove step
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  <Textarea
                                    aria-label="Step description"
                                    className="doc-input mb-5 min-h-[55px] px-1 text-xs leading-6 text-neutral-500 shadow-none focus-visible:ring-1"
                                    value={step.description}
                                    onChange={(e) =>
                                      updateStep({
                                        description: e.target.value,
                                      })
                                    }
                                  />
                                  <CaptureView key={step.id} step={step} />
                                  <div className="mt-3 flex justify-between text-[9px] text-neutral-400">
                                    <span>
                                      Capture {String(stepIndex + 1).padStart(2, "0")} ·{" "}
                                      {step.screen}
                                    </span>
                                    <span>
                                      {guide.demo
                                        ? "Illustrative screen"
                                        : "Saved locally"}
                                    </span>
                                  </div>
                                  <Separator className="mb-5 mt-7" />
                                  <div className="flex items-center justify-between">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-0 text-[11px] text-neutral-500"
                                      disabled={stepIndex === 0}
                                      onClick={() => setStepIndex((i) => i - 1)}
                                    >
                                      <ArrowLeft className="size-3" />
                                      Previous step
                                    </Button>
                                    <span className="text-[10px] text-neutral-400">
                                      {stepIndex + 1} of {guide.steps.length}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-0 text-[11px] text-neutral-500"
                                      disabled={stepIndex === guide.steps.length - 1}
                                      onClick={() => setStepIndex((i) => i + 1)}
                                    >
                                      Next step
                                      <ArrowRight className="size-3" />
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <div className="py-10 text-center text-xs text-neutral-500">
                                  All steps have been removed. Use Undo to restore them.
                                </div>
                              )}
                            </article>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                refine();
                              }}
                              className="mt-4 flex items-center gap-2 rounded-lg border bg-white p-2 pl-3"
                            >
                              <Sparkles className="size-3.5 shrink-0 text-neutral-400" />
                              <Input
                                aria-label="Refine document"
                                placeholder={
                                  guide.demo
                                    ? "How would you like to refine this?"
                                    : "Ask AI to edit, e.g. make this shorter"
                                }
                                disabled={!guide.demo && !window.desktop}
                                maxLength={4000}
                                value={refinement}
                                onChange={(e) => setRefinement(e.target.value)}
                                className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                              />
                              <Button
                                size="icon"
                                className="size-7 shrink-0"
                                aria-label="Apply refinement"
                                disabled={
                                  (!guide.demo && !window.desktop) || !refinement.trim()
                                }
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                            </form>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-neutral-400">
                              <span>
                                {guide.demo
                                  ? "AI preview · Try “Make it shorter” or “Turn into a checklist”"
                                  : "Ask for edits, then review and save a new version"}
                              </span>
                              {undo && (
                                <button
                                  className="text-neutral-600 underline underline-offset-2"
                                  onClick={() => {
                                    updateGuide(undo);
                                    setStepIndex(0);
                                    setUndo(null);
                                    setMessage("Change undone");
                                  }}
                                >
                                  Undo change
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="mb-5 flex items-start justify-between">
                              <div>
                                <h2 className="text-sm font-medium">
                                  Review your captures
                                </h2>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                  Select a step to edit it in your document.
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[9px] font-normal">
                                {guide.demo ? "Sample captures" : "Local captures"}
                              </Badge>
                            </div>
                            {!guide.steps.length && (
                              <div className="rounded-lg border bg-white p-8 text-center text-xs leading-6 text-neutral-500">
                                No clicks were captured. Start a new recording and click
                                inside the selected display, outside Captura Desk.
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                              {guide.steps.map((s, i) => (
                                <button
                                  key={s.id}
                                  className="overflow-hidden rounded-lg border bg-white text-left hover:border-neutral-400"
                                  onClick={() => {
                                    setStepIndex(i);
                                    setTab("document");
                                  }}
                                >
                                  <div className="h-[155px] overflow-hidden border-b">
                                    <div
                                      className="origin-top-left scale-[.6]"
                                      style={{ width: "166.67%" }}
                                    >
                                      <CaptureView step={s} compact />
                                    </div>
                                  </div>
                                  <div className="p-3">
                                    <div className="mb-1 text-[9px] text-neutral-400">
                                      STEP {i + 1}
                                    </div>
                                    <div className="text-[11px] font-medium">
                                      {s.title}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <aside className="inspector scrollbar flex w-[278px] shrink-0 flex-col overflow-auto border-l bg-white px-5 py-5">
                      <div className="flex items-center justify-between">
                        <h2 className="text-[11px] font-medium">Workflow steps</h2>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-neutral-400 hover:text-neutral-700"
                          aria-label="Manage steps"
                          title="Reorder or remove steps"
                          disabled={recording || workspaceBusy}
                          onClick={() => setManageSteps(true)}
                        >
                          <Settings2 className="size-3.5" />
                        </Button>
                      </div>
                      <p className="mb-5 mt-1 text-[10px] text-neutral-400">
                        Each action, in context.
                      </p>
                      <div className="space-y-1">
                        {guide.steps.map((s, i) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setStepIndex(i);
                              setTab("document");
                            }}
                            className={cn(
                              "flex w-full items-start gap-2.5 rounded-md px-2.5 py-3 text-left",
                              i === stepIndex ? "bg-neutral-100" : "hover:bg-neutral-50",
                            )}
                            aria-current={i === stepIndex ? "step" : undefined}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded border text-[9px]",
                                i === stepIndex
                                  ? "border-neutral-700 bg-neutral-700 text-white"
                                  : "border-neutral-200 text-neutral-400",
                              )}
                            >
                              {i + 1}
                            </span>
                            <span>
                              <span className="block text-[11px] leading-5">
                                {s.title}
                              </span>
                              <span className="mt-0.5 block text-[9px] text-neutral-400">
                                {s.capturedAt
                                  ? `Click · ${new Date(s.capturedAt).toLocaleTimeString()}`
                                  : `Sample · 00:${String(4 + i * 11).padStart(2, "0")}`}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="min-h-8 flex-1" />
                      <Separator className="mb-5 mt-7" />
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium">
                        <Settings2 className="size-3.5 text-neutral-500" />
                        Project instructions
                      </div>
                      <p className="line-clamp-4 text-[11px] leading-5 text-neutral-500">
                        {project.instructions ||
                          "No instructions yet. Tell us how to document your work."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 h-8 w-full justify-between text-[10px] font-normal shadow-none"
                        onClick={() => openModal("instructions")}
                      >
                        Edit instructions
                        <ArrowRight className="size-3" />
                      </Button>
                      <p className="mt-4 text-[9px] leading-4 text-neutral-400">
                        Applies to every recording in this project.
                      </p>
                    </aside>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
        {recording && (
          <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-xl border bg-white px-4 py-3 shadow-xl">
            <span
              className={cn(
                "size-2 rounded-full",
                paused ? "bg-neutral-400" : "animate-pulse bg-red-500",
              )}
            />
            <span className="text-xs">
              {paused
                ? "Paused"
                : recorder.status === "stopping"
                  ? "Saving…"
                  : "Recording"}
            </span>
            <span className="font-mono text-[11px] text-neutral-400">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </span>
            <Separator orientation="vertical" className="!h-5" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              disabled={
                recorderBusy || !["recording", "paused"].includes(recorder.status)
              }
              onClick={() =>
                recordAction(() =>
                  paused
                    ? window.desktop!.resumeRecording()
                    : window.desktop!.pauseRecording(),
                )
              }
            >
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={
                recorderBusy || !["recording", "paused"].includes(recorder.status)
              }
              onClick={() => recordAction(() => window.desktop!.stopRecording())}
            >
              <Square className="size-3" />
              Finish
            </Button>
          </div>
        )}
        <Dialog
          open={modal !== null}
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="text-xl tracking-tight">
                {modal === "project"
                  ? "Create a project"
                  : modal === "instructions"
                    ? "Project instructions"
                    : modal === "record"
                      ? "Record a workflow"
                      : "Built around your workflow"}
              </DialogTitle>
              <DialogDescription className="pt-1 text-xs leading-6">
                {modal === "project"
                  ? "Give your workflows a home and your documentation a direction."
                  : modal === "instructions"
                    ? "Tell the AI who you’re writing for and what a good document looks like."
                    : modal === "record"
                      ? "Add a little context before you begin. Your project instructions are already included."
                      : "A minimalist desktop workspace for capturing and documenting the way you work."}
              </DialogDescription>
            </DialogHeader>
            {modal === "help" ? (
              <>
                <div className="space-y-4 py-3 text-xs leading-6 text-neutral-500">
                  <p>
                    Projects, instructions, document edits, and step changes are saved on
                    this device. Export creates a Markdown file using the desktop save
                    dialog.
                  </p>
                  <p>
                    Recording saves real screenshots and mouse clicks on your selected
                    display. Captures stay local until you explicitly send selected
                    captures for AI generation.
                  </p>
                  <p>
                    Use <kbd className="rounded border px-1">Ctrl K</kbd> to find a
                    project. Select any workflow step to edit its title and description.
                  </p>
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={() => setModal(null)}>
                    Got it
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  modal === "record" ? startRecording() : saveProject();
                }}
              >
                <div className="space-y-5 py-3">
                  <div>
                    <label htmlFor="form-name" className="mb-2 block text-xs font-medium">
                      {modal === "record"
                        ? "What are you demonstrating?"
                        : "Project name"}
                    </label>
                    <Input
                      id="form-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder={
                        modal === "record"
                          ? "e.g. Resolve a failed payment"
                          : "e.g. Operations playbook"
                      }
                      required
                      maxLength={120}
                      className="text-xs"
                    />
                  </div>
                  {modal === "record" && (
                    <div>
                      <label
                        htmlFor="display-source"
                        className="mb-2 block text-xs font-medium"
                      >
                        Display to record
                      </label>
                      <select
                        id="display-source"
                        value={displayId}
                        onChange={(e) => setDisplayId(e.target.value)}
                        className="h-9 w-full rounded-md border bg-white px-3 text-xs"
                      >
                        {displays.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} · {d.bounds.width} × {d.bounds.height}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() =>
                          window.desktop
                            ?.identifyDisplays()
                            .catch((e) => setStartError(errorMessage(e)))
                        }
                      >
                        Identify displays
                      </Button>
                      <p className="mt-2 text-[10px] text-neutral-400">
                        Only clicks inside this display are saved. Captura Desk controls
                        are excluded.
                      </p>
                      {(!window.desktop || window.desktop.platform !== "win32") && (
                        <p role="alert" className="mt-2 text-xs text-red-600">
                          Recording requires the Windows desktop application.
                        </p>
                      )}
                      {startError && (
                        <p role="alert" className="mt-2 text-xs text-red-600">
                          {startError}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label htmlFor="form-text" className="mb-2 block text-xs font-medium">
                      {modal === "record"
                        ? "Additional context"
                        : "How should we document your work?"}
                      {modal === "record" && (
                        <span className="ml-1 font-normal text-neutral-400">
                          (optional)
                        </span>
                      )}
                    </label>
                    <Textarea
                      id="form-text"
                      value={formText}
                      onChange={(e) => setFormText(e.target.value)}
                      placeholder={
                        modal === "record"
                          ? "Who is this for? What should they pay attention to?"
                          : "Write numbered steps for new team members. Be concise, explain important decisions, and include a final checklist."
                      }
                      className="min-h-[135px] text-xs leading-6"
                    />
                  </div>
                  {modal === "record" ? (
                    <div className="flex gap-3 rounded-md border bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500">
                      <Monitor className="mt-0.5 size-4 shrink-0" />
                      <div>
                        <strong className="font-medium text-neutral-700">
                          Local screen recording
                        </strong>
                        <p>
                          The selected display is captured while recording. A floating bar
                          lets you pause or finish. All images stay on this device.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] leading-5 text-neutral-400">
                      Your instructions are saved with the project and can be changed at
                      any time.
                    </p>
                  )}
                </div>
                <DialogFooter className="mt-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      !formName.trim() ||
                      starting ||
                      (modal === "record" &&
                        (!displayId ||
                          !window.desktop ||
                          window.desktop.platform !== "win32"))
                    }
                  >
                    {modal === "record" ? (
                      <>
                        <Circle className="size-3" />
                        {starting ? "Starting…" : "Start recording"}
                      </>
                    ) : modal === "project" ? (
                      "Create project"
                    ) : (
                      "Save instructions"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription>
                “{deleteTarget?.name}” and all its documents, recordings, and original
                capture files will be permanently deleted from this workspace. Exported
                copies are not affected. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p role="alert" className="text-xs text-red-600">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleting || recording}
                onClick={() => void confirmProjectDeletion()}
              >
                {deleting ? "Deleting…" : "Delete project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!recordingDeleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleting) setRecordingDeleteTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {deletingRevision ? "Delete document?" : "Delete recording?"}
              </DialogTitle>
              <DialogDescription>
                {deletingRevision
                  ? "Only this document will be permanently deleted. The original recording, screenshots, and other documents will remain."
                  : "This recording, all documents derived from it, and its original screenshots will be permanently deleted. Your project and exported files will remain. This cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p role="alert" className="text-sm text-red-600">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => setRecordingDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={confirmRecordingDeletion}
              >
                {deleting
                  ? "Deleting…"
                  : deletingRevision
                    ? "Delete document"
                    : "Delete recording"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={renameRevision} onOpenChange={setRenameRevision}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename revision</DialogTitle>
              <DialogDescription>
                Change the label shown beside the revision number.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!revisionName.trim()) return;
                updateGuide({ revisionLabel: revisionName.trim() });
                setRenameRevision(false);
              }}
            >
              <Input
                aria-label="Revision label"
                value={revisionName}
                maxLength={120}
                onChange={(e) => setRevisionName(e.target.value)}
              />
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRenameRevision(false)}
                >
                  Cancel
                </Button>
                <Button disabled={!revisionName.trim()}>Save label</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {manageSteps && guide && (
          <ManageSteps
            key={guide.id}
            steps={guide.steps}
            onClose={() => setManageSteps(false)}
            onChange={(steps) => {
              setUndo(structuredClone(guide));
              const activeId = step?.id;
              updateGuide({ steps });
              setStepIndex(
                Math.max(
                  0,
                  steps.findIndex((s) => s.id === activeId),
                ),
              );
            }}
          />
        )}
        {aiSettings && <AIProviderSettings onClose={() => setAISettings(false)} />}
        {(aiGenerate || aiEdit) && guide && window.desktop && (
          <AIGenerateDialog
            workspaceId={workspaceId}
            projectId={project.id}
            guide={guide}
            flush={flush}
            instruction={aiEdit || undefined}
            onClose={() => {
              setAIGenerate(false);
              setAIEdit("");
            }}
            onApplied={(updated, id) => {
              setRefinement("");
              setProjects(updated);
              setGuideId(id);
              setStepIndex(0);
              setUndo(null);
              setMessage("AI document saved. Your original document is unchanged.");
            }}
          />
        )}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Remove this step?</DialogTitle>
              <DialogDescription className="text-xs leading-6">
                “{step?.title}” will be removed from this document. Original capture files
                remain on this device. You can undo this change afterward.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteStep}>
                Remove step
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {message && (
          <div
            role="status"
            className="fixed bottom-6 right-6 z-50 flex max-w-[420px] items-center gap-3 rounded-lg border bg-white px-4 py-3 text-xs shadow-lg"
          >
            <Check className="size-3.5 shrink-0" />
            <span>{message}</span>
            <button aria-label="Dismiss notification" onClick={() => setMessage("")}>
              <X className="size-3.5 text-neutral-400" />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

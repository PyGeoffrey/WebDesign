// Get Supabase's client factory from the CDN script loaded by index.html.
const { createClient } = supabase;

// Project URL identifies the Supabase backend this page connects to.
const supabaseUrl = "https://tswxwpneritewlqwjrtb.supabase.co";
// This public anonymous key identifies the browser client; Supabase policies still control access.
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzd3h3cG5lcml0ZXdscXdqcnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MzgzOTIsImV4cCI6MjExMTExNDM5Mn0.bB_QirDDf-h1hvGfgbo8w9kpa6rI0BBzsEI2aPjd_XA";

// Reuse this client for all authentication and session requests.
const supabaseClient = createClient(supabaseUrl, supabaseKey);

console.log("Supabase connected.", supabaseClient);

// isLoading: true shows the overlay; false hides it and re-enables authentication buttons.
// Toggle the progress overlay and disable authentication buttons during network work.
function setLoading(isLoading) {
    const loadingScreen = $("#loadingScreen"); // jQuery handle for the page-wide loading element.
    loadingScreen.toggleClass("is-loading", isLoading);
    // Tell screen readers whether the overlay is currently active.
    loadingScreen.attr("aria-hidden", isLoading ? "false" : "true");
    $(".auth-button").prop("disabled", isLoading);
}

// query: a function that performs one Supabase operation and returns its promise.
// Run a Supabase request with visible loading feedback for at least half a second.
async function runSupabaseQuery(query) {
    setLoading(true);

    // Let the browser paint the overlay before starting the request.
    await new Promise(resolve => requestAnimationFrame(resolve));

    const startedAt = performance.now(); // Used to calculate how long the request took.

    try {
        const result = await query(); // The caller supplies the specific Supabase operation.
        const elapsed = performance.now() - startedAt; // Actual request duration in milliseconds.

        if (elapsed < 500) {
            // Avoid a brief flash by filling the remainder of the minimum display time.
            await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
        }

        return result;
    } finally {
        setLoading(false);
    }
}

// Process sign-up through the form event so clicking or pressing Enter both work.
$("#signupForm").on("submit", async function(event) {
    // Stop the browser's normal page reload; JavaScript handles the request instead.
    event.preventDefault();

    const display_name = $("#signupUsername").val(); // Name saved as Supabase user metadata.
    const email = $("#signupEmail").val(); // Email address for the new account.
    const password = $("#signupPassword").val(); // Sent to Supabase; it is not saved by this script.

    // Run the sign-up request through the shared loading indicator.
    // Supabase returns data on success or error details when the request fails.
    const { data, error } = await runSupabaseQuery(() =>
        supabaseClient.auth.signUp({ email, password, options: { data: { display_name } } })
    );
    if (error) {
        console.error("Error signing up:", error.message);
        showPopup("Error signing up: " + error.message, "error");
    } else {
        console.log("Sign up successful:", data);
        showPopup("Signup successful!");
        // Replace the forms with the dashboard after successful account creation.
        $("#authContainer").hide();
        $("#dashboard").show();
        await showDashboard(data.user);
    }
});

// Process login as an async form submission while retaining Enter-key support.
$("#loginForm").on("submit", async function(event) {
    event.preventDefault();

    const email = $("#loginEmail").val(); // Read the account email from the form.
    const password = $("#loginPassword").val(); // Read the password for this sign-in attempt.

    // Ask Supabase to verify the credentials while the loading overlay is visible.
    // data contains the signed-in user; error contains a message if credentials are rejected.
    const { data, error } = await runSupabaseQuery(() =>
        supabaseClient.auth.signInWithPassword({ email, password })
    );
    if (error) {
        console.error("Error logging in:", error.message);
        showPopup("Error logging in: " + error.message, "error");
    } else {
        console.log("Login successful:", data);
        showPopup("Signed in.");
        if (rememberMe.is(":checked")) {
            // Remember only the email; password storage is handled by the browser's password manager.
            localStorage.setItem("vwcc-remembered-email", email);
            localStorage.setItem("vwcc-remember-me", "true");
        } else {
            localStorage.removeItem("vwcc-remembered-email");
            localStorage.removeItem("vwcc-remember-me");
        }
        // Replace the forms with the dashboard after successful authentication.
        $("#authContainer").hide();
        $("#dashboard").show();
        await showDashboard(data.user);
    }
});

// Sign out remotely, then clear remembered-login state and return to the forms.
$("#logoutButton").click(async function() {
    // Sign-out returns an error only when Supabase could not complete the request.
    const { error } = await runSupabaseQuery(() =>
        supabaseClient.auth.signOut()
    );
    if (error) {
        console.error("Error logging out:", error.message);
        showPopup("Error logging out: " + error.message, "error");
    } else {
        console.log("Logout successful.");
        showPopup("You have been logged out.");
        // Explicit logout removes the saved email and Remember Me preference.
        localStorage.removeItem("vwcc-remembered-email");
        localStorage.removeItem("vwcc-remember-me");
        $("#rememberMe").prop("checked", false);
        $("#loginEmail").val("");
        $("#loginPassword").val("");
        $("#authContainer").show();
        $("#dashboard").hide();
        stopProjectSync();
    }
});

const themeButton = $("#themeButton"); // Button the user clicks to switch themes.
const savedTheme = localStorage.getItem("vwcc-theme"); // Theme selected during an earlier visit.

// theme: either "dark" or "light", used to select the page's color palette.
// Apply theme classes and update the button label to match the active mode.
function applyTheme(theme) {
    const dark = theme === "dark"; // Convert the theme name into a boolean for DOM updates.
    $("body").toggleClass("dark-theme", dark);
    $("html").toggleClass("dark-theme-preload", dark);
    themeButton.html(dark ? "☀&nbsp;Light" : "⏾&nbsp;Dark");
    themeButton.attr("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

// Restore the saved choice, or use light mode for a first-time visitor.
applyTheme(savedTheme || "light");

// Toggle the theme and save the new choice for the next page load.
themeButton.click(function() {
    const nextTheme = $("body").hasClass("dark-theme") ? "light" : "dark"; // Choose the opposite of the current mode.
    applyTheme(nextTheme);
    localStorage.setItem("vwcc-theme", nextTheme);
});

const rememberMe = $("#rememberMe"); // Checkbox that controls local email remembering.
const rememberedEmail = localStorage.getItem("vwcc-remembered-email"); // Address saved by a previous opt-in.

if (rememberedEmail) {
    // Prefill only the email; passwords remain under browser password-manager control.
    $("#loginEmail").val(rememberedEmail);
    rememberMe.prop("checked", true);
}

rememberMe.on("change", function() {
    if (!rememberMe.is(":checked")) {
    // Unchecking the option immediately removes its saved email and preference.
        localStorage.removeItem("vwcc-remembered-email");
        localStorage.removeItem("vwcc-remember-me");
    }
});

// user: authenticated Supabase user object containing ID, email, and metadata.
// Show account-specific dashboard messages and load this account's browser-local projects.
async function showDashboard(user) {
    const displayNameKey = "vwcc-local-display-name-" + user.id; // Store each account's alias under its unique ID.
    const savedDisplayName = localStorage.getItem(displayNameKey)?.trim(); // Treat blank aliases as missing.
    const welcomeMessage = $("#welcomeMessage"); // Element used for the temporary greeting.
    const repositoryNotice = $("#repositoryNotice"); // Special notice for the main repository account.
    const isMainAccount = user.email?.toLowerCase() === "main@frame.com"; // Compare emails without case sensitivity.

    clearTimeout(window.welcomeMessageTimer);
    welcomeMessage.stop(true).hide().text("");

    if (isMainAccount) {
        repositoryNotice
            .text("The main repository. Touch only with permission.")
            .show();
    } else {
        repositoryNotice.hide().text("");
    }

    if (savedDisplayName) {
        welcomeMessage
            .text("Welcome, " + savedDisplayName + "!")
            .fadeIn(180);

        window.welcomeMessageTimer = setTimeout(() => {
            welcomeMessage.fadeOut(180);
        }, 3000);
    }

    $("#authContainer").hide();
    $("#dashboard").show();
    await initializeProjects(user);

    // Ask for a local alias once; this guard prevents duplicate prompts during repeated dashboard calls.
    if (!savedDisplayName && pendingProjectAction?.type !== "display-name") {
        pendingProjectAction = { type: "display-name", userId: user.id };
        projectDialogTitle.textContent = "Choose your display name";
        projectDialogMessage.textContent = "Choose the name shown in this browser. You can use the same name as your account.";
        projectNameInput.hidden = false;
        skipDeleteConfirmationOption.hidden = true;
        projectNameInput.value = "";
        projectNameInput.setAttribute("aria-label", "Your display name");
        projectNameInput.placeholder = "Your display name";
        projectDialogConfirm.textContent = "Save name";
        projectDialogConfirm.classList.remove("delete-button");
        document.getElementById("projectDialogCancel").hidden = true;
        projectDialog.hidden = false;
        projectNameInput.focus();
    }
}

// No parameters; this reads the saved preference and asks Supabase for the stored session.
// Restore login only when Remember Me was enabled on this browser.
async function restoreRememberedSession() {
    if (localStorage.getItem("vwcc-remember-me") !== "true") {
        await new Promise(resolve => setTimeout(resolve, 500));
        setLoading(false);
        return;
    }

    const startedAt = performance.now(); // Used to enforce a minimum loading-screen duration.

    // Ask Supabase whether this browser still has a valid sign-in session.
    // data may contain the restored session; error describes a failed session lookup.
    const { data, error } = await supabaseClient.auth.getSession();

    const elapsed = performance.now() - startedAt; // Time spent checking the session.
    if (elapsed < 500) {
        await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
    }

    setLoading(false);

    if (error) {
        console.error("Error restoring session:", error.message);
        showPopup("Error restoring session: " + error.message, "error");
        return;
    }

    if (data.session?.user) {
        await showDashboard(data.session.user);
    }
}

// Start session restoration as soon as the page's event handlers are ready.
restoreRememberedSession();

// Cache the editor elements so project switching does not repeatedly search the page.
const codeInput = $(".code-input"); // Editable source textarea.
const codeHighlight = $(".code-highlight code"); // Prism-rendered syntax layer behind the textarea.
const codeOutput = $(".code-output"); // Sandboxed iframe that displays the Run result.
const saveStatus = document.getElementById("saveStatus"); // Badge showing whether project data was saved.
const codeDiagnostics = document.getElementById("codeDiagnostics"); // Panel containing HTML errors and warnings.
const diagnosticsSummary = codeDiagnostics.querySelector(".diagnostics-summary"); // Overall result/count message.
const diagnosticsList = codeDiagnostics.querySelector(".diagnostics-list"); // Clickable individual issues.
let projects = []; // Ordered project records: ID, name, source HTML, and preview output.
let activeProjectId = null; // ID of the project currently shown in the editor.
let projectStorageKey = null; // Per-account localStorage key assigned after sign-in.
let projectNameSequence = 1; // Next generated project number, persisted to avoid reusing deleted names.
let currentUserId = null; // Authenticated Supabase user ID used to scope all project table operations.
let saveStatusTimer = null; // Timer that changes the save badge from "Saving..." to "Saved".
let saveRevision = 0; // Prevent older save results from replacing the newest save status.
let projectSaveInProgress = 0; // Number of pending database writes; syncing waits until writes finish.
let syncTimer = null; // Continuous fallback that refetches project rows from Supabase.
let syncChannel = null; // Optional realtime subscription for faster project updates.
let syncFetchInProgress = false; // Prevent poll and realtime requests from applying out-of-order snapshots.
let lastSyncedCode = new Map(); // Most recently fetched code for each project, used to protect local edits.
let codeCheckTimer = null; // Debounce timer for automatic HTML validation.
let codeCheckRevision = 0; // Token used to ignore results from outdated validation runs.
let contextProjectId = null; // Project whose right-click menu is currently open.
let draggedProjectId = null; // Project currently being dragged across the tab strip.
let projectDropGhost = null; // Placeholder showing the dragged tab's proposed insertion point.
const projectContextMenu = document.getElementById("projectContextMenu"); // Right-click actions for project tabs.
const projectDialog = document.getElementById("projectDialog"); // Shared modal for alias, rename, and delete prompts.
const projectDialogForm = document.getElementById("projectDialogForm"); // Form that submits the current dialog action.
const projectDialogTitle = document.getElementById("projectDialogTitle"); // Dialog heading updated for each action.
const projectDialogMessage = document.getElementById("projectDialogMessage"); // Instruction or validation feedback.
const projectNameInput = document.getElementById("projectNameInput"); // Input reused for aliases and project names.
const projectDialogConfirm = document.getElementById("projectDialogConfirm"); // Button whose label follows the action.
const skipDeleteConfirmationOption = document.getElementById("skipDeleteConfirmationOption"); // Opt-out row shown only for deletion.
const skipDeleteConfirmation = document.getElementById("skipDeleteConfirmation"); // Checkbox that stores that opt-out.
let pendingProjectAction = null; // Action and target ID waiting for dialog confirmation.
let htmlValidatorPromise = null; // Reused promise ensures the validator is loaded only once.

const starterCode = codeInput.val(); // Template copied into each newly created project.

// state: saved/saving/error state; label: text shown beside the indicator dot.
// Update the save label and state attribute used to color its indicator dot.
function setSaveStatus(state, label) {
    saveStatus.dataset.state = state;
    saveStatus.querySelector(".save-status-label").textContent = label;
}

// Persist project code and names to Supabase using project_id; user_id is generated by Supabase, and localStorage retains UI preferences.
async function saveProjects() {
    if (!projectStorageKey) return;

    projectSaveInProgress += 1;
    const revision = ++saveRevision;
    clearTimeout(saveStatusTimer); // Replace an older timer so rapid saves do not show "Saved" too early.
    setSaveStatus("saving", "Saving...");

    // Keep active tab and name sequence locally because the database table does not contain those fields.
    localStorage.setItem(projectStorageKey, JSON.stringify({ activeProjectId, projectNameSequence }));

    try {
        const projectRows = projects.map(project => ({
            project_id: project.id,
            project_name: project.name,
            code: project.code
        }));

        // Upsert one row per project so code and names sync across devices signed into this account.
        if (projectRows.length > 0) {
            const { error: upsertError } = await supabaseClient
                .from("VWCC Data")
                .upsert(projectRows, { onConflict: "project_id" });

            if (upsertError) throw upsertError;
        }

        const { data: remoteRows, error: loadError } = await supabaseClient
            .from("VWCC Data")
            .select("project_id")
            .eq("user_id", currentUserId);

        if (loadError) throw loadError;

        const activeProjectIds = new Set(projects.map(project => project.id));
        const staleIds = (remoteRows || [])
            .map(row => row.project_id)
            .filter(id => !activeProjectIds.has(id));

        if (staleIds.length > 0) {
            const { error: deleteError } = await supabaseClient
                .from("VWCC Data")
                .delete()
                .eq("user_id", currentUserId)
                .in("project_id", staleIds);

            if (deleteError) throw deleteError;
        }

        if (revision === saveRevision) {
            // Record successful database values so a later sync can distinguish remote changes from local typing.
            projects.forEach(project => lastSyncedCode.set(project.id, project.code));
            saveStatusTimer = setTimeout(() => setSaveStatus("saved", "Saved"), 250);
        }
    } catch (error) {
        if (revision !== saveRevision) return;
        setSaveStatus("error", "Not saved");
        console.error("Unable to save projects to Supabase:", error);
        showPopup("Projects could not be saved.", "error");
    } finally {
        projectSaveInProgress = Math.max(0, projectSaveInProgress - 1);
    }
}

// No parameters; uses the saved counter and current names to choose the next unique label.
// Generate the next numbered name while avoiding names that already exist.
function nextProjectName() {
    const existingNames = new Set(projects.map(project => project.name.trim().toLocaleLowerCase())); // Normalized for case-insensitive comparison.
    let name; // Candidate label checked against existing project names.

    do {
        name = "Project " + projectNameSequence;
        projectNameSequence += 1;
    } while (existingNames.has(name.toLocaleLowerCase()));

    return name;
}

// No parameters; copies the currently selected project's editor and preview into its record.
// Copy the visible editor and preview back into the active project's saved record.
function saveActiveProject() {
    const activeProject = projects.find(project => project.id === activeProjectId); // Find the record currently being edited.
    if (!activeProject) return;

    activeProject.code = codeInput.val();
    activeProject.output = codeOutput.attr("srcdoc") || "";
    saveProjects();
}

// No parameters; focuses the code textarea and moves its insertion point to character zero.
// Focus the textarea and put the insertion point at the start of its contents.
function placeCursorOnFirstLine() {
    const editor = codeInput[0]; // Convert the jQuery result to its native textarea element.
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(0, 0);
}

// No parameters; hides the menu and clears the remembered target project ID.
// Close the tab menu and clear which project its actions were targeting.
function hideProjectContextMenu() {
    projectContextMenu.hidden = true;
    contextProjectId = null;
}

// projectId: ID of the tab whose project should be renamed.
// Prepare the shared dialog for renaming a project and select its current name for replacement.
function renameProject(projectId) {
    const project = projects.find(item => item.id === projectId); // Resolve the tab's stable project ID.
    if (!project) return;

    pendingProjectAction = { type: "rename", projectId };
    projectDialogTitle.textContent = "Rename project";
    projectDialogMessage.textContent = "Enter a unique name for this project.";
    projectNameInput.hidden = false;
    skipDeleteConfirmationOption.hidden = true;
    projectNameInput.value = project.name;
    projectDialogConfirm.textContent = "Save";
    projectDialogConfirm.classList.remove("delete-button");
    projectDialog.hidden = false;
    projectNameInput.focus();
    projectNameInput.select();
}

// projectId: ID of the project requested for deletion.
// Delete immediately if confirmation was disabled; otherwise open the delete confirmation dialog.
function deleteProject(projectId) {
    const project = projects.find(item => item.id === projectId); // Resolve the project whose tab was closed.
    if (!project) return;

    try {
        // This preference is stored separately so it survives deleting every project.
        if (localStorage.getItem(projectStorageKey + "-skip-delete-confirmation") === "true") {
            commitProjectDeletion(projectId);
            return;
        }
    } catch (error) {
        console.error("Unable to read delete confirmation preference:", error);
    }

    pendingProjectAction = { type: "delete", projectId };
    projectDialogTitle.textContent = "Delete project?";
    projectDialogMessage.textContent = "“" + project.name + "” and its code will be permanently deleted.";
    projectNameInput.hidden = true;
    skipDeleteConfirmationOption.hidden = false;
    skipDeleteConfirmation.checked = false;
    projectDialogConfirm.textContent = "Delete";
    projectDialogConfirm.classList.add("delete-button");
    projectDialog.hidden = false;
    projectDialogConfirm.focus();
}

// No parameters; hides the dialog and resets its temporary action and checkbox state.
// Hide the shared dialog and reset temporary options before it is reused.
function closeProjectDialog() {
    projectDialog.hidden = true;
    pendingProjectAction = null;
    skipDeleteConfirmationOption.hidden = true;
    skipDeleteConfirmation.checked = false;
    document.getElementById("projectDialogCancel").hidden = false;
}

// projectId: ID of the confirmed project to remove from the project list.
// Remove a project, switch to another if necessary, and retain an empty workspace when none remain.
function commitProjectDeletion(projectId) {
    const closingActiveProject = projectId === activeProjectId; // True when the editor currently shows this project.
    if (projects.length === 1) {
        projects = projects.filter(item => item.id !== projectId);
        // Keep the empty list saved so reloads show the getting-started state instead of recreating a project.
        activeProjectId = null;
        projectNameSequence = 1; // Start over the numbering for new projects when the list is empty.
        codeInput.val("");
        codeOutput.attr("srcdoc", "");
        codeDiagnostics.hidden = true;
        document.getElementById("emptyProjectsState").hidden = false;
        updateCodeHighlight();
        renderProjectTabs();
        saveProjects();
        return;
    }

    if (closingActiveProject) {
        activeProjectId = null;
        let currentProjectIndex = projects.findIndex(item => item.id === projectId);
        projects = projects.filter(item => item.id !== projectId);
        activateProject(projects[(currentProjectIndex == 0 ? 0 : currentProjectIndex - 1)].id);
    } else {
        projects = projects.filter(item => item.id !== projectId);
        renderProjectTabs();
        saveProjects();
    }
}

// Route the shared dialog's Save/Delete button to the action that opened it.
// event is the native form-submit event; prevent navigation and dispatch the pending action instead.
projectDialogForm.addEventListener("submit", function(event) {
    // Keep this interaction inside the page instead of submitting/reloading the document.
    event.preventDefault();
    if (!pendingProjectAction) return;

    if (pendingProjectAction.type === "display-name") {
        const name = projectNameInput.value.trim(); // Remove accidental spaces at the beginning/end.
        if (!name) {
            projectDialogMessage.textContent = "Enter a display name to continue.";
            projectNameInput.focus();
            return;
        }

        try {
            // Save this display alias locally for this account; it is not synced to Supabase.
            localStorage.setItem("vwcc-local-display-name-" + pendingProjectAction.userId, name);
        } catch (error) {
            console.error("Unable to save display name:", error);
            projectDialogMessage.textContent = "The name could not be saved in this browser. Check storage availability and try again.";
            showPopup("Display name could not be saved.", "error");
            return;
        }

        closeProjectDialog();
        clearTimeout(window.welcomeMessageTimer);
        $("#welcomeMessage").stop(true).text("Welcome, " + name + "!").fadeIn(180);
        window.welcomeMessageTimer = setTimeout(() => $("#welcomeMessage").fadeOut(180), 3000);
        showPopup("Display name saved.");
        return;
    }

    if (pendingProjectAction.type === "rename") {
        const project = projects.find(item => item.id === pendingProjectAction.projectId); // Project being renamed.
        const name = projectNameInput.value.trim(); // Proposed name without surrounding spaces.
        if (!project || !name) {
            projectDialogMessage.textContent = "Project names cannot be empty.";
            projectNameInput.focus();
            return;
        }

        const duplicate = projects.some(item => // Names must be unique regardless of capitalization.
            item.id !== project.id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
        );
        if (duplicate) {
            projectDialogMessage.textContent = "A project with that name already exists. Choose a different name.";
            showPopup("That project name is already in use.", "error");
            projectNameInput.focus();
            projectNameInput.select();
            return;
        }

        project.name = name; // Update the in-memory project; saveProjects persists the change below.
        renderProjectTabs();
        saveProjects();
        closeProjectDialog();
        return;
    }

    if (pendingProjectAction.type === "delete") {
        const projectId = pendingProjectAction.projectId; // Preserve the target before closing clears pending state.
            if (skipDeleteConfirmation.checked) {
                try {
                    // Remember the opt-out separately from project data so it survives an empty project list.
                    localStorage.setItem(projectStorageKey + "-skip-delete-confirmation", "true");
                } catch (error) {
                    console.error("Unable to save delete confirmation preference:", error);
                    showPopup("Could not save the delete preference.", "error");
                }
            }
        closeProjectDialog();
        commitProjectDeletion(projectId);
    }
});

document.getElementById("projectDialogCancel").addEventListener("click", closeProjectDialog);

// No parameters; renders the current projects array and updates editor/empty-state visibility.
// Rebuild the tab strip from the projects array so its order and active state stay in sync.
function renderProjectTabs() {
    const projectTabs = document.getElementById("projectTabs"); // Container holding all project tabs.
    projectTabs.replaceChildren();
    updateProjectWorkspace();

    projects.forEach(project => { // Create one tab for each saved project, in array order.
        const tab = document.createElement("div"); // Outer element also serves as the draggable tab surface.
        tab.className = "project-tab" + (project.id === activeProjectId ? " is-active" : "");
        tab.dataset.projectId = project.id;
        tab.draggable = true;

        const selectButton = document.createElement("button"); // Button used to activate this project.
        selectButton.type = "button";
        selectButton.className = "project-tab-button";
        selectButton.textContent = project.name;
        selectButton.setAttribute("role", "tab");
        selectButton.setAttribute("aria-selected", project.id === activeProjectId ? "true" : "false");
        selectButton.title = "Double-click to rename";

        const closeButton = document.createElement("button"); // Button used to request project deletion.
        closeButton.type = "button";
        closeButton.className = "project-close-button";
        closeButton.textContent = "×";
        closeButton.setAttribute("aria-label", "Close " + project.name);

        tab.append(selectButton, closeButton);
        projectTabs.appendChild(tab);
    });
}

// No parameters; reads projects.length and toggles the editor versus empty-state section.
// Show the editor when projects exist; otherwise show the getting-started message and plus button.
function updateProjectWorkspace() {
    const hasProjects = projects.length > 0; // A single boolean drives both visibility changes.
    document.querySelector(".code-editor").hidden = !hasProjects;
    document.getElementById("emptyProjectsState").hidden = hasProjects;
}

// projectId: project to move; offset: -1 moves left and +1 moves right.
// Move a project one position left or right in the saved tab order.
function moveProject(projectId, offset) {
    const currentIndex = projects.findIndex(project => project.id === projectId); // Current array position.
    const targetIndex = currentIndex + offset; // Adjacent position requested by the menu action.
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= projects.length) return;

    const [project] = projects.splice(currentIndex, 1); // Remove it first so insertion uses the updated order.
    projects.splice(targetIndex, 0, project);
    renderProjectTabs();
    saveProjects();
}

// projectId: dragged project; destinationIndex: its final zero-based position in the array.
// Move a dragged project to the insertion position indicated by the ghost placeholder.
function moveProjectToIndex(projectId, destinationIndex) {
    const sourceIndex = projects.findIndex(project => project.id === projectId); // Find the dragged record.
    if (sourceIndex < 0) return;

    const [project] = projects.splice(sourceIndex, 1); // Remove it before calculating its final position.
    const insertIndex = Math.max(0, Math.min(destinationIndex, projects.length)); // Clamp to valid array bounds.
    projects.splice(insertIndex, 0, project);
    renderProjectTabs();
    saveProjects();
}

// projectId: project shown in the context menu; its position determines disabled directions.
// Disable Move left/right when the selected tab is already at that edge.
function updateProjectMoveActions(projectId) {
    const projectIndex = projects.findIndex(project => project.id === projectId); // Current tab position.
    projectContextMenu.querySelector("[data-project-action='move-left']").disabled = projectIndex <= 0;
    projectContextMenu.querySelector("[data-project-action='move-right']").disabled = projectIndex < 0 || projectIndex >= projects.length - 1;
}

// pointerX: horizontal mouse position used to calculate the intended insertion gap.
// Place the drag placeholder before the tab nearest the pointer, or at the end of the strip.
function updateProjectDropGhost(pointerX) {
    // The ghost marks an insertion slot; the dragged tab itself is removed from layout while dragging.
    const projectTabs = document.getElementById("projectTabs"); // Parent whose children are reordered visually.
    const remainingTabs = Array.from(projectTabs.querySelectorAll(".project-tab")) // Ignore the hidden source tab.
        .filter(tab => tab.dataset.projectId !== draggedProjectId);
    const beforeTab = remainingTabs.find(tab => pointerX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2); // First tab whose midpoint is to the right.

    if (beforeTab) {
        if (projectDropGhost.nextElementSibling !== beforeTab) {
            projectTabs.insertBefore(projectDropGhost, beforeTab);
        }
    } else if (projectTabs.lastElementChild !== projectDropGhost) {
        projectTabs.appendChild(projectDropGhost);
    }
}

// No parameters; removes temporary drag visuals and forgets the dragged project ID.
// Remove the ghost and drag styling after a drop or canceled drag.
function clearProjectDragState() {
    projectDropGhost?.remove();
    projectDropGhost = null;
    document.querySelectorAll(".project-tab.is-dragging")
        .forEach(tab => tab.classList.remove("is-dragging"));
    draggedProjectId = null;
}

// projectId: ID of the project to make active in the editor.
// Save the old project, load the requested project into the editor, and refresh its diagnostics.
function activateProject(projectId) {
    if (projectId === activeProjectId) return;

    saveActiveProject();
    codeDiagnostics.hidden = true;
    activeProjectId = projectId;
    const project = projects.find(item => item.id === activeProjectId); // Record whose source and preview should be displayed.
    if (!project) return;

    codeInput.val(project.code);
    codeOutput.attr("srcdoc", project.output);
    updateCodeHighlight();
    renderProjectTabs();
    saveProjects();
    placeCursorOnFirstLine();
    scheduleCodeCheck();
}

// user: authenticated Supabase user whose projects should be loaded.
// Load Supabase project rows and migrate older browser-saved projects once when the table is empty.
async function initializeProjects(user) {
    projectStorageKey = "vwcc-projects-" + user.id;
    currentUserId = user.id;

    let savedUI = null;
    try {
        savedUI = JSON.parse(localStorage.getItem(projectStorageKey) || "null");
    } catch (error) {
        console.error("Unable to read local project preferences:", error);
    }

    // On startup, select the first project returned by Supabase rather than restoring a previous active tab.
    activeProjectId = null;
    projectNameSequence = Number.isInteger(savedUI?.projectNameSequence)
        ? savedUI.projectNameSequence
        : 1;

    const { data: remoteRows, error: loadError } = await supabaseClient
        .from("VWCC Data")
        .select("project_id, project_name, code")
        .eq("user_id", currentUserId);

    if (loadError) {
        console.error("Unable to load Supabase projects:", loadError);
        showPopup("Projects could not be loaded.", "error");
        projects = [];
        activeProjectId = null;
        projectNameSequence = 1;
        renderProjectTabs();
        return;
    }

    if (remoteRows && remoteRows.length > 0) {
        projects = remoteRows.map(row => {
            const stableId = row.project_id;
            return {
                id: stableId,
                name: row.project_name || "Project",
                code: row.code || "",
                output: ""
            };
        });
    } else {
        // Preserve migration from the previous localStorage format before switching fully to Supabase.
        let legacyProjects = null;
        try {
            const legacySaved = JSON.parse(localStorage.getItem(projectStorageKey) || "null");
            legacyProjects = Array.isArray(legacySaved?.projects) ? legacySaved.projects : null;
        } catch (error) {
            console.error("Unable to read legacy project data:", error);
        }

        if (legacyProjects) {
            projects = legacyProjects
                .filter(project => project && typeof project.id === "string")
                .map(project => ({
                    id: project.id,
                    name: typeof project.name === "string" ? project.name : "Project",
                    code: typeof project.code === "string" ? project.code : "",
                    output: typeof project.output === "string" ? project.output : ""
                }));
        } else {
            projects = [{ id: crypto.randomUUID(), name: nextProjectName(), code: starterCode, output: "" }];
        }

        await saveProjects();
    }

    const namedProjectNumbers = projects
        .map(project => /^Project (\d+)$/i.exec(project.name)?.[1])
        .filter(Boolean)
        .map(Number);
    const minimumNextNumber = Math.max(0, ...namedProjectNumbers) + 1;
    projectNameSequence = Math.max(projectNameSequence, minimumNextNumber);

    if (projects.length === 0) {
        activeProjectId = null;
        codeInput.val("");
        codeDiagnostics.hidden = true;
        codeOutput.attr("srcdoc", "");
        updateCodeHighlight();
        renderProjectTabs();
        startProjectSync();
        return;
    }

    // The first project in the database/tab list is the startup target for every login.
    activeProjectId = projects[0].id;

    const activeProject = projects.find(project => project.id === activeProjectId);
    codeInput.val(activeProject.code);
    lastSyncedCode.set(activeProjectId, activeProject.code);
    codeDiagnostics.hidden = true;
    codeOutput.attr("srcdoc", activeProject.output);
    updateCodeHighlight();
    renderProjectTabs();
    placeCursorOnFirstLine();
    scheduleCodeCheck();
    startProjectSync();
}

// Fetch the account's current project rows and merge remote names/code without overwriting unsaved active text.
async function refetchProjects() {
    if (!currentUserId || projectSaveInProgress > 0 || syncFetchInProgress) return;
    syncFetchInProgress = true;

    try {
        const { data: remoteRows, error } = await supabaseClient
            .from("VWCC Data")
            .select("project_id, project_name, code")
            .eq("user_id", currentUserId);

        if (error) {
            console.error("Unable to refetch Supabase projects:", error);
            return;
        }

        const remoteProjects = (remoteRows || []).map(row => ({
            id: row.project_id,
            name: row.project_name || "Project",
            code: row.code || "",
            output: ""
        }));

        const remoteIds = new Set(remoteProjects.map(project => project.id));
        const activeProject = projects.find(project => project.id === activeProjectId);
        const existingOrder = new Map(projects.map((project, index) => [project.id, index]));

        // Supabase does not guarantee row order, so retain tab order and append newly discovered projects.
        remoteProjects.sort((first, second) => {
            const firstIndex = existingOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER;
            const secondIndex = existingOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER;
            return firstIndex - secondIndex || first.name.localeCompare(second.name);
        });

        // Preserve unsaved typing in the active textarea until the local or remote value is saved.
        const visibleCode = codeInput.val();
        const visibleWasSynced = activeProject && visibleCode === (lastSyncedCode.get(activeProject.id) ?? activeProject.code);

        projects = remoteProjects.map(remoteProject => {
            const existingProject = projects.find(project => project.id === remoteProject.id);
            return {
                ...remoteProject,
                output: existingProject?.output || ""
            };
        });

        // If the current project was deleted remotely, select the first remaining project.
        if (activeProjectId && !remoteIds.has(activeProjectId)) {
            activeProjectId = projects[0]?.id || null;
        }

        if (projects.length === 0) {
            activeProjectId = null;
            codeInput.val("");
            codeOutput.attr("srcdoc", "");
            codeDiagnostics.hidden = true;
            updateCodeHighlight();
            renderProjectTabs();
            return;
        }

        const activeAfterSync = projects.find(project => project.id === activeProjectId) || projects[0];
        activeProjectId = activeAfterSync.id;

        if (visibleWasSynced) {
            const selectionStart = codeInput[0].selectionStart;
            const selectionEnd = codeInput[0].selectionEnd;
            codeInput.val(activeAfterSync.code);
            codeInput[0].setSelectionRange(selectionStart, selectionEnd);
            codeOutput.attr("srcdoc", activeAfterSync.output);
            updateCodeHighlight();
        }

        projects.forEach(project => lastSyncedCode.set(project.id, project.code));
        renderProjectTabs();
    } finally {
        syncFetchInProgress = false;
    }
}

// Poll every 1.5 seconds so cross-device edits appear even if realtime publication is unavailable.
function startProjectSync() {
    stopProjectSync();
    syncTimer = setInterval(refetchProjects, 1500);

    try {
        syncChannel = supabaseClient
            .channel("vwcc-project-sync")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "VWCC Data",
                filter: `user_id=eq.${currentUserId}`
            }, refetchProjects)
            .subscribe();
    } catch (error) {
        console.error("Realtime project sync unavailable:", error);
    }
}

// Stop polling and remove the realtime channel when the account leaves or logs out.
function stopProjectSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;

    if (syncChannel) {
        supabaseClient.removeChannel(syncChannel);
        syncChannel = null;
    }
}

// No parameters; reads the current textarea value and refreshes the syntax-colored layer.
// Render the textarea's source as Prism markup in the aligned highlight layer underneath it.
function updateCodeHighlight() {
    const code = codeInput.val(); // Current source text being edited.
    codeHighlight.html(Prism.highlight(code, Prism.languages.markup, "markup") + "\n");
}

// On each edit, refresh syntax colors, save the project, and queue a debounced HTML check.
codeInput.on("input", function() {
    codeDiagnostics.hidden = true;
    updateCodeHighlight();
    saveActiveProject();
    scheduleCodeCheck();
});
// Keep the visible Prism layer at the same scroll position as the transparent textarea.
codeInput.on("scroll", function() {
    $(".code-highlight").scrollTop(codeInput.scrollTop());
    $(".code-highlight").scrollLeft(codeInput.scrollLeft());
});

// Render the initial textarea content once the DOM and Prism library are ready.
updateCodeHighlight();

// Delegate tab clicks from the stable container because tabs are rebuilt dynamically.
$("#projectTabs").on("click", ".project-tab-button", function() {
    activateProject(this.closest(".project-tab").dataset.projectId);
});

// A double-click on a tab name opens the rename dialog.
$("#projectTabs").on("dblclick", ".project-tab-button", function() {
    renameProject(this.closest(".project-tab").dataset.projectId);
});

// The tab's close button begins the delete flow.
$("#projectTabs").on("click", ".project-close-button", function() {
    deleteProject(this.closest(".project-tab").dataset.projectId);
});

// Start dragging by recording the project ID and creating a same-width insertion ghost.
// event carries the browser drag data used to move the selected project tab.
$("#projectTabs").on("dragstart", ".project-tab", function(event) {
    draggedProjectId = this.dataset.projectId;
    this.classList.add("is-dragging");
    const dragEvent = event.originalEvent || event; // Use the browser event to access its DataTransfer object.
    dragEvent.dataTransfer.effectAllowed = "move";
    dragEvent.dataTransfer.setData("text/plain", draggedProjectId);
    projectDropGhost = document.createElement("div");
    projectDropGhost.className = "project-tab-ghost";
    projectDropGhost.setAttribute("aria-hidden", "true");
    projectDropGhost.textContent = projects.find(project => project.id === draggedProjectId)?.name || "";
    projectDropGhost.style.width = this.getBoundingClientRect().width + "px";
    updateProjectDropGhost(dragEvent.clientX);
});

// Move the ghost as the pointer passes between tab centers.
// event supplies pointer coordinates so the insertion ghost can track the cursor.
$("#projectTabs").on("dragover", function(event) {
    if (!draggedProjectId || !projectDropGhost) return;
    event.preventDefault();
    updateProjectDropGhost((event.originalEvent || event).clientX);
});

// Convert the ghost's visual position into an array index and persist the reordered projects.
// event marks the drop and provides the final visual order to save.
$("#projectTabs").on("drop", function(event) {
    if (!draggedProjectId || !projectDropGhost) return;
    event.preventDefault();
    const childElements = Array.from(this.children); // Current visual order, including the ghost.
    const ghostIndex = childElements.indexOf(projectDropGhost); // Position where the dragged project belongs.
    const destinationIndex = childElements
        .slice(0, ghostIndex)
        .filter(element => element.classList.contains("project-tab") && element.dataset.projectId !== draggedProjectId)
        .length;
    const sourceId = draggedProjectId; // Preserve the ID before clearing drag state.

    clearProjectDragState();
    moveProjectToIndex(sourceId, destinationIndex);
});

// Clean up if a drag ends without a successful drop.
$("#projectTabs").on("dragend", ".project-tab", function() {
    clearProjectDragState();
});

// Replace the browser menu only when the pointer is over a project tab.
// event is canceled only on project tabs so other page areas keep their native context menu.
$("#projectTabs").on("contextmenu", ".project-tab", function(event) {
    event.preventDefault();
    contextProjectId = this.dataset.projectId;
    updateProjectMoveActions(contextProjectId);
    projectContextMenu.hidden = false;

    const pointer = event.originalEvent || event; // Native pointer coordinates for menu placement.
    const left = Math.min(pointer.clientX, window.innerWidth - projectContextMenu.offsetWidth - 8); // Keep menu inside the right edge.
    const top = Math.min(pointer.clientY, window.innerHeight - projectContextMenu.offsetHeight - 8); // Keep menu inside the bottom edge.
    projectContextMenu.style.left = Math.max(8, left) + "px";
    projectContextMenu.style.top = Math.max(8, top) + "px";
    projectContextMenu.querySelector("[data-project-action='rename']").focus();
});

// Route menu buttons to move, rename, or delete the project that opened the menu.
$("#projectContextMenu").on("click", "[data-project-action]", function() {
    const projectId = contextProjectId; // Target selected when the context menu opened.
    const action = this.dataset.projectAction; // Action name stored on the clicked menu item.

    if (action === "move-left" || action === "move-right") {
        moveProject(projectId, action === "move-left" ? -1 : 1);
        updateProjectMoveActions(projectId);
        return;
    }

    hideProjectContextMenu();

    if (action === "rename") renameProject(projectId);
    if (action === "delete") deleteProject(projectId);
});

// Close the project menu when the user clicks anywhere outside it.
$(document).on("click", function(event) {
    if (!projectContextMenu.hidden && !projectContextMenu.contains(event.target)) {
        hideProjectContextMenu();
    }
});

// Escape closes ordinary dialogs and menus, but the required first display-name prompt stays open.
// event.key identifies Escape, which closes dismissible menus and dialogs.
$(document).on("keydown", function(event) {
    if (event.key === "Escape" && !projectDialog.hidden) {
        if (pendingProjectAction?.type === "display-name") {
            event.preventDefault();
            return;
        }
        closeProjectDialog();
        return;
    }

    if (event.key === "Escape" && !projectContextMenu.hidden) {
        hideProjectContextMenu();
    }
});

// No parameters; creates a uniquely named starter project and activates it.
// Create a starter project and activate it; both plus buttons use this function.
function createProject() {
    saveActiveProject();
    const project = { // New projects begin with the starter HTML and an empty preview.
        id: crypto.randomUUID(),
        name: nextProjectName(),
        code: starterCode,
        output: ""
    };
    projects.push(project);
    activeProjectId = null;
    activateProject(project.id);
}

// Share one creation handler between the normal tab-bar button and the empty-state button.
$("#newProjectButton, #emptyNewProjectButton").on("click", createProject);

// Run the current HTML in the sandboxed iframe, then save the rendered source with its project.
$("#runCodeButton").off("click").on("click", function() {
    codeOutput.attr("srcdoc", codeInput.val());
    saveActiveProject();
});

// No parameters; returns the cached validator-loading promise or creates it on first use.
// Load the browser-compatible HTML validator only when needed and reuse its promise.
function getHtmlValidator() {
    if (!htmlValidatorPromise) {
        // Dynamic import avoids loading the validator until an automatic check is scheduled.
        htmlValidatorPromise = import("https://esm.sh/html-validate@11.22.1/browser")
            .then(({ HtmlValidate }) => new HtmlValidate({ extends: ["html-validate:recommended"] }))
            .catch(error => {
                htmlValidatorPromise = null;
                throw error;
            });
    }

    return htmlValidatorPromise;
}

// messages: list of validator issues; errorCount and warningCount: totals shown in the summary.
// Replace the diagnostics panel with a summary and one clickable row per validator message.
function showCodeDiagnostics(messages, errorCount, warningCount) {
    diagnosticsList.replaceChildren();
    codeDiagnostics.hidden = false;

    if (errorCount === 0 && warningCount === 0) {
        diagnosticsSummary.textContent = "No HTML issues found.";
        return;
    }

    diagnosticsSummary.textContent = errorCount + (errorCount === 1 ? " error" : " errors") +
        (warningCount ? " · " + warningCount + (warningCount === 1 ? " warning" : " warnings") : "");

    messages.forEach(message => { // Build safe DOM elements instead of inserting validator text as HTML.
        const row = document.createElement("li"); // List item for one issue.
        const button = document.createElement("button"); // Clicking it moves the caret to the issue.
        button.type = "button";
        button.className = "diagnostic-item" + (message.severity === 1 ? " is-warning" : "");
        button.dataset.offset = String(message.offset ?? 0);
        button.dataset.size = String(message.size ?? 0);

        const location = document.createElement("span"); // Validator's 1-based line and column.
        location.className = "diagnostic-location";
        location.textContent = "L" + message.line + ":" + message.column;

        const description = document.createElement("span"); // Human-readable explanation of the issue.
        description.textContent = message.message;
        button.append(location, description);
        row.appendChild(button);
        diagnosticsList.appendChild(row);
    });
}

function scheduleCodeCheck() {
    // No parameters; debounce validation while typing and invalidate any older check still in flight.
    clearTimeout(codeCheckTimer);
    const revision = ++codeCheckRevision; // A unique version lets older asynchronous runs detect they are stale.
    codeCheckTimer = setTimeout(() => runCodeCheck(revision), 500);
}

// revision: scheduled-check token used to reject results made stale by edits or tab switches.
// Validate a snapshot and display it only if the editor still contains that same project and source.
async function runCodeCheck(revision) {
    const source = codeInput.val(); // Immutable source snapshot for this asynchronous check.
    const checkedProjectId = activeProjectId; // Avoid showing results on a different project tab.

    try {
        const validator = await getHtmlValidator(); // Ready-to-use HTML validator instance.
        const report = await validator.validateString(source, "project.html"); // Parse and check this snapshot as HTML.
        if (revision !== codeCheckRevision || checkedProjectId !== activeProjectId || source !== codeInput.val()) return;

        const messages = report.results.flatMap(result => result.messages || []); // Combine messages from every report entry.
        showCodeDiagnostics(messages, report.errorCount, report.warningCount);
    } catch (error) {
        if (revision !== codeCheckRevision || checkedProjectId !== activeProjectId || source !== codeInput.val()) return;

        // Convert a CDN or validator failure into a visible diagnostic rather than failing silently.
        console.error("HTML validation failed:", error);
        showCodeDiagnostics([{
            line: 1,
            column: 1,
            offset: 0,
            size: 0,
            severity: 2,
            message: "The HTML validator could not load. Check your internet connection and try again."
        }], 1, 0);
    }
}

// Turn a diagnostic click into a selection at the reported character offset.
$("#codeDiagnostics").on("click", ".diagnostic-item", function() {
    const editor = codeInput[0]; // Native textarea needed by the selection API.
    const start = Math.min(Number(this.dataset.offset) || 0, editor.value.length); // Clamp to valid source bounds.
    const end = Math.min(start + (Number(this.dataset.size) || 0), editor.value.length); // End of issue selection.
    editor.focus();
    editor.setSelectionRange(start, end);
});

// popup: notification element to animate and remove.
// Animate a notification out, then remove it even if the browser skips transitionend.
function dismissPopup(popup) {
    if (!popup || popup.classList.contains("is-leaving")) return;

    popup.classList.remove("is-visible");
    popup.classList.add("is-leaving");

    // Remove the notification as soon as its movement or fade finishes.
    popup.addEventListener("transitionend", function handleTransitionEnd(event) {
        if (event.propertyName === "transform" || event.propertyName === "opacity") {
            popup.remove();
        }
    }, { once: true });

    setTimeout(() => popup.remove(), 350); // Fallback cleanup if no transition event is fired.
}

// message: text to show; type: "success" or "error" selects its visual state.
// Create a success/error notification with a close button and automatic four-second dismissal.
function showPopup(message, type = "success") {
    const popupStack = document.getElementById("popupStack"); // Shared container that stacks notifications.

    const popup = document.createElement("div"); // New independent notification element.
    popup.className = "popup is-visible " + (type === "error" ? "is-error" : "is-success");
    popup.setAttribute("role", "status");

    const text = document.createElement("span"); // Text node container avoids treating messages as HTML.
    text.textContent = message;

    const closeButton = document.createElement("button"); // Accessible manual-dismiss control.
    closeButton.type = "button";
    closeButton.className = "popup-close";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => dismissPopup(popup));

    popup.append(text, closeButton); // Add both controls before inserting the popup into the page.
    popupStack.appendChild(popup);

    requestAnimationFrame(() => popup.classList.add("is-visible")); // Start the entrance animation on the next frame.
    setTimeout(() => dismissPopup(popup), 4000);
}
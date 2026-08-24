/**
 * BSAI Asset Library Auto List - Frontend Extension
 *
 * Adds a custom info display and Prev/Next/Reset buttons at the bottom of the node.
 * Uses DOM elements (not canvas) to avoid being obscured by ComfyUI DOM widgets.
 * The index auto-increments after each execution.
 * Supports both BSAI_AssetLibraryAutoList and BSAI_AssetLibraryAutoListByType.
 */

import { app } from "../../../scripts/app.js";

const TARGET_NODES = new Set([
    "BSAI_AssetLibraryAutoList",
    "BSAI_AssetLibraryAutoListByType",
]);

// Height reserved at bottom for custom UI
const CUSTOM_UI_HEIGHT = 60; // 20 info + 30 buttons + 10 padding

app.registerExtension({
    name: "BSAI.AssetLibraryAutoList",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!TARGET_NODES.has(nodeData.name)) return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            setupAutoListNode(this);
        };

        // Auto-increment after execution completes
        const origOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            incrementIndex(this);
            this.setDirtyCanvas(true, true);
        };

        // Add extra height at bottom for custom UI
        const origComputeSize = nodeType.prototype.computeSize;
        nodeType.prototype.computeSize = function (out) {
            const size = origComputeSize ? origComputeSize.apply(this, arguments) : [240, 120];
            size[1] += CUSTOM_UI_HEIGHT;
            return size;
        };

        // After node is drawn, position our DOM elements below all widgets
        const origOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
            positionCustomUI(this);
        };
    },
});

function setupAutoListNode(node) {
    node._bsai_scriptWidget = node.widgets?.find(w => w.name === "script_text");
    node._bsai_indexWidget = node.widgets?.find(w => w.name === "index");
    node._bsai_modeWidget = node.widgets?.find(w => w.name === "mode");

    if (node._bsai_indexWidget) {
        if (isNaN(parseInt(node._bsai_indexWidget.value))) {
            node._bsai_indexWidget.value = 1;
        }
    }

    node._bsaiAutoListState = {
        total: 0,
        lastScript: node._bsai_scriptWidget?.value || "",
        lastMode: node._bsai_modeWidget?.value || "",
    };

    // Create DOM container for custom UI
    const container = document.createElement("div");
    container.className = "bsai-auto-list-controls";
    container.style.cssText = `
        position: absolute;
        left: 4px;
        right: 4px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 4px;
        background: rgba(20, 28, 40, 0.85);
        border-top: 1px solid rgba(255,255,255,0.15);
        z-index: 100;
        pointer-events: auto;
    `;

    // Info text
    const infoEl = document.createElement("div");
    infoEl.style.cssText = `
        text-align: center;
        color: #9bc;
        font-size: 11px;
        font-weight: bold;
        font-family: sans-serif;
        line-height: 18px;
    `;
    infoEl.textContent = "等待脚本输入 ｜ Waiting for script...";
    container.appendChild(infoEl);

    // Button row
    const btnRow = document.createElement("div");
    btnRow.style.cssText = `
        display: flex;
        gap: 4px;
        justify-content: space-between;
    `;

    const buttons = [
        { label: "◀ 上一个", action: "prev" },
        { label: "重置 Reset", action: "reset" },
        { label: "下一个 ▶", action: "next" },
    ];

    const btnElements = [];
    buttons.forEach(b => {
        const btn = document.createElement("button");
        btn.textContent = b.label;
        btn.style.cssText = `
            flex: 1;
            height: 24px;
            border: 1px solid #5a7aaa;
            border-radius: 4px;
            background: linear-gradient(180deg, #2a3a5a, #1e2e4e);
            color: #dde;
            font-size: 11px;
            cursor: pointer;
            font-family: sans-serif;
            transition: filter 100ms;
        `;
        btn.addEventListener("mouseenter", () => btn.style.filter = "brightness(1.3)");
        btn.addEventListener("mouseleave", () => btn.style.filter = "none");
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (b.action === "next") incrementIndex(node, 1);
            else if (b.action === "prev") incrementIndex(node, -1);
            else if (b.action === "reset") resetIndex(node);
        });
        btnRow.appendChild(btn);
        btnElements.push(btn);
    });

    container.appendChild(btnRow);

    // Append to node's DOM element
    if (node.dom) {
        node.dom.appendChild(container);
    } else {
        // Fallback: try LiteGraph's node element
        setTimeout(() => {
            if (node.dom) node.dom.appendChild(container);
        }, 100);
    }

    node._bsaiAutoListState.container = container;
    node._bsaiAutoListState.infoEl = infoEl;
    node._bsaiAutoListState.btnElements = btnElements;

    // Recalculate total when script changes
    if (node._bsai_scriptWidget) {
        const origCallback = node._bsai_scriptWidget.callback;
        node._bsai_scriptWidget.callback = function (v) {
            if (origCallback) origCallback.call(this, v);
            const state = node._bsaiAutoListState;
            if (!state) return;
            if (v !== state.lastScript) {
                state.lastScript = v;
                updateTotal(node);
                if (node._bsai_indexWidget) {
                    node._bsai_indexWidget.value = 1;
                }
            }
            node.setDirtyCanvas(true, true);
        };
    }

    // Recalculate total when mode changes
    if (node._bsai_modeWidget) {
        const origModeCallback = node._bsai_modeWidget.callback;
        node._bsai_modeWidget.callback = function (v) {
            if (origModeCallback) origModeCallback.call(this, v);
            const state = node._bsaiAutoListState;
            if (!state) return;
            if (v !== state.lastMode) {
                state.lastMode = v;
                updateTotal(node);
                if (node._bsai_indexWidget) {
                    node._bsai_indexWidget.value = 1;
                }
            }
            node.setDirtyCanvas(true, true);
        };
    }

    // Override index widget callback
    if (node._bsai_indexWidget) {
        const origIndexCallback = node._bsai_indexWidget.callback;
        node._bsai_indexWidget.callback = function (v) {
            if (origIndexCallback) origIndexCallback.call(this, v);
            node.setDirtyCanvas(true, true);
        };
    }

    // Initial setup
    setTimeout(() => {
        updateTotal(node);
        node.setSize(node.computeSize());
        positionCustomUI(node);
        node.setDirtyCanvas(true, true);
    }, 50);
}

function positionCustomUI(node) {
    const state = node._bsaiAutoListState;
    if (!state || !state.container) return;

    // Find the y position after all widgets
    // Use node.last_y if available (set by LiteGraph after drawing widgets)
    let widgetBottom = node.last_y || 0;

    // Also check DOM widget positions
    if (node.widgets) {
        for (const w of node.widgets) {
            if (w.inputEl && w.inputEl.offsetParent) {
                const rect = w.inputEl.getBoundingClientRect();
                const nodeRect = node.dom?.getBoundingClientRect();
                if (nodeRect) {
                    const relativeBottom = rect.bottom - nodeRect.top;
                    if (relativeBottom > widgetBottom) {
                        widgetBottom = relativeBottom;
                    }
                }
            }
        }
    }

    // Position our container below all widgets
    state.container.style.top = widgetBottom + "px";

    // Update info text
    const current = parseInt(node._bsai_indexWidget?.value) || 1;
    const total = state.total || 0;
    if (state.infoEl) {
        if (total > 0) {
            state.infoEl.textContent = `资产 ${current} / ${total}  ｜  Asset ${current} of ${total}`;
        } else {
            state.infoEl.textContent = "等待脚本输入 ｜ Waiting for script...";
        }
    }

    // Ensure node is tall enough
    const requiredHeight = widgetBottom + CUSTOM_UI_HEIGHT + 10;
    if (node.size[1] < requiredHeight) {
        node.size[1] = requiredHeight;
    }
}

function updateTotal(node) {
    const state = node._bsaiAutoListState;
    if (!state) return;

    const scriptText = node._bsai_scriptWidget?.value || "";
    if (!scriptText) {
        state.total = 0;
        return;
    }

    const mode = node._bsai_modeWidget?.value || "";
    const isByType = node._bsai_modeWidget != null;

    if (isByType && mode) {
        state.total = countAssetsByMode(scriptText, mode);
    } else {
        const matches = scriptText.match(/@图\d+/g);
        state.total = matches ? matches.length : 0;
    }
}

function countAssetsByMode(scriptText, mode) {
    if (mode.includes("仅角色") || mode.includes("Characters")) {
        return countAssetsInSection(scriptText, "角色档案");
    } else if (mode.includes("仅道具") || mode.includes("Props")) {
        return countAssetsInSection(scriptText, "道具档案");
    } else if (mode.includes("仅场景") || mode.includes("Scenes")) {
        return countAssetsInSection(scriptText, "场景档案");
    } else {
        return (
            countAssetsInSection(scriptText, "角色档案") +
            countAssetsInSection(scriptText, "道具档案") +
            countAssetsInSection(scriptText, "场景档案")
        );
    }
}

function countAssetsInSection(scriptText, sectionName) {
    const pattern = new RegExp(
        "\\[" + sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "\\][：:]\\s*\\n?(.*?)(?=\\n\\[|$)",
        "s"
    );
    const match = scriptText.match(pattern);
    if (!match) return 0;
    const content = match[1];
    const refs = content.match(/@图\d+/g);
    return refs ? refs.length : 0;
}

function incrementIndex(node, delta = 1) {
    const state = node._bsaiAutoListState;
    if (!state || !node._bsai_indexWidget) return;

    const current = parseInt(node._bsai_indexWidget.value) || 1;
    const total = state.total || 0;

    let next = current + delta;
    if (total > 0) {
        if (next > total) next = 1;
        if (next < 1) next = total;
    } else {
        next = Math.max(1, next);
    }

    node._bsai_indexWidget.value = next;
    positionCustomUI(node);
    node.setDirtyCanvas(true, true);
}

function resetIndex(node) {
    if (!node._bsai_indexWidget) return;
    node._bsai_indexWidget.value = 1;
    positionCustomUI(node);
    node.setDirtyCanvas(true, true);
}

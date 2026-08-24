/**
 * BSAI Asset Library Auto List - Frontend Extension
 *
 * Adds a custom info display and Prev/Next/Reset buttons at the bottom of the node.
 * The index auto-increments after each execution.
 * Supports both BSAI_AssetLibraryAutoList and BSAI_AssetLibraryAutoListByType.
 */

import { app } from "../../../scripts/app.js";

const TARGET_NODES = new Set([
    "BSAI_AssetLibraryAutoList",
    "BSAI_AssetLibraryAutoListByType",
]);

// Extra height needed at bottom for custom UI (info line + buttons + padding)
const EXTRA_UI_HEIGHT = 56; // 20 info + 24 buttons + 12 padding

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
            size[1] += EXTRA_UI_HEIGHT;
            return size;
        };
    },
});

function setupAutoListNode(node) {
    // Find the widgets
    node._bsai_scriptWidget = node.widgets?.find(w => w.name === "script_text");
    node._bsai_indexWidget = node.widgets?.find(w => w.name === "index");
    node._bsai_modeWidget = node.widgets?.find(w => w.name === "mode");

    // Make sure index starts at 1 if it's NaN
    if (node._bsai_indexWidget) {
        if (isNaN(parseInt(node._bsai_indexWidget.value))) {
            node._bsai_indexWidget.value = 1;
        }
    }

    // Store state
    node._bsaiAutoListState = {
        total: 0,
        buttonRects: [],
        suppressReset: false,  // Guard to prevent index reset during programmatic updates
        lastScript: "",       // Track last script value to detect real changes
        lastMode: "",         // Track last mode value to detect real changes
    };

    // Initialize tracked values
    node._bsaiAutoListState.lastScript = node._bsai_scriptWidget?.value || "";
    node._bsaiAutoListState.lastMode = node._bsai_modeWidget?.value || "";

    // Draw custom UI at the bottom of the node
    const origDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        if (origDrawForeground) origDrawForeground.apply(this, arguments);
        drawCustomUI(ctx, this);
    };

    // Handle mouse clicks on custom buttons
    const origMouseDown = node.onMouseDown;
    node.onMouseDown = function (e, pos, canvas) {
        if (handleMouseDown(this, pos)) return true;
        if (origMouseDown) return origMouseDown.apply(this, arguments);
        return false;
    };

    // Recalculate total when script changes
    if (node._bsai_scriptWidget) {
        const origCallback = node._bsai_scriptWidget.callback;
        node._bsai_scriptWidget.callback = function (v) {
            if (origCallback) origCallback.call(this, v);
            const state = node._bsaiAutoListState;
            if (!state) return;

            // Only reset index if script actually changed
            if (v !== state.lastScript) {
                state.lastScript = v;
                updateTotal(node);
                if (!state.suppressReset && node._bsai_indexWidget) {
                    node._bsai_indexWidget.value = 1;
                }
            }
            node.setDirtyCanvas(true, true);
        };
    }

    // Recalculate total when mode changes (for ByType node)
    if (node._bsai_modeWidget) {
        const origModeCallback = node._bsai_modeWidget.callback;
        node._bsai_modeWidget.callback = function (v) {
            if (origModeCallback) origModeCallback.call(this, v);
            const state = node._bsaiAutoListState;
            if (!state) return;

            // Only reset index if mode actually changed
            if (v !== state.lastMode) {
                state.lastMode = v;
                updateTotal(node);
                if (!state.suppressReset && node._bsai_indexWidget) {
                    node._bsai_indexWidget.value = 1;
                }
            }
            node.setDirtyCanvas(true, true);
        };
    }

    // Override index widget callback to prevent unwanted resets
    if (node._bsai_indexWidget) {
        const origIndexCallback = node._bsai_indexWidget.callback;
        node._bsai_indexWidget.callback = function (v) {
            // Just call original callback, don't trigger any resets
            if (origIndexCallback) origIndexCallback.call(this, v);
            node.setDirtyCanvas(true, true);
        };
    }

    // Initial total calculation
    setTimeout(() => {
        updateTotal(node);
        node.setSize(node.computeSize());
        node.setDirtyCanvas(true, true);
    }, 50);
}

function isInCustomUIArea(node, pos) {
    const [, my] = pos;
    const nodeHeight = node.size[1];
    return my >= nodeHeight - EXTRA_UI_HEIGHT;
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

function drawCustomUI(ctx, node) {
    const state = node._bsaiAutoListState;
    if (!state) return;

    const width = node.size[0];
    const nodeHeight = node.size[1];

    // Custom UI area at the bottom of the node
    const areaTop = nodeHeight - EXTRA_UI_HEIGHT;

    const infoY = areaTop + 4;
    const btnY = areaTop + 26;
    const btnHeight = 22;

    // Separator line at top of custom area
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, areaTop);
    ctx.lineTo(width - 8, areaTop);
    ctx.stroke();

    // Info text
    const current = parseInt(node._bsai_indexWidget?.value) || 1;
    const total = state.total || 0;
    let infoText;
    if (total > 0) {
        infoText = `资产 ${current} / ${total}  ｜  Asset ${current} of ${total}`;
    } else {
        infoText = "等待脚本输入 ｜ Waiting for script...";
    }

    ctx.fillStyle = "#8ac";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(infoText, width / 2, infoY);

    // Buttons
    const btnWidth = (width - 24) / 3;
    const buttons = [
        { label: "◀ 上一个", x: 8, action: "prev" },
        { label: "重置 Reset", x: 12 + btnWidth, action: "reset" },
        { label: "下一个 ▶", x: 16 + btnWidth * 2, action: "next" },
    ];

    // Store button rects in node-local coordinates
    state.buttonRects = buttons.map(b => ({
        action: b.action,
        x: b.x,
        y: btnY,
        w: btnWidth,
        h: btnHeight,
    }));

    buttons.forEach(b => {
        ctx.fillStyle = "#2a3a5a";
        ctx.strokeStyle = "#4a6a9a";
        ctx.lineWidth = 1;
        roundRect(ctx, b.x, btnY, btnWidth, btnHeight, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#cde";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, b.x + btnWidth / 2, btnY + btnHeight / 2);
    });

    ctx.restore();
}

function handleMouseDown(node, pos) {
    const state = node._bsaiAutoListState;
    if (!state || !state.buttonRects) return false;

    // Only check if click is within the bottom custom UI area
    if (!isInCustomUIArea(node, pos)) return false;

    const [mx, my] = pos;

    for (const btn of state.buttonRects) {
        if (mx >= btn.x && mx <= btn.x + btn.w &&
            my >= btn.y && my <= btn.y + btn.h) {
            if (btn.action === "next") {
                incrementIndex(node, 1);
            } else if (btn.action === "prev") {
                incrementIndex(node, -1);
            } else if (btn.action === "reset") {
                resetIndex(node);
            }
            node.setDirtyCanvas(true, true);
            return true;
        }
    }
    return false;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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

    // Set the suppress flag to prevent any callback from resetting index
    state.suppressReset = true;
    node._bsai_indexWidget.value = next;
    // Don't call the index widget's callback to avoid triggering cascading resets
    // Just update the canvas directly
    state.suppressReset = false;
}

function resetIndex(node) {
    const state = node._bsaiAutoListState;
    if (!state || !node._bsai_indexWidget) return;

    state.suppressReset = true;
    node._bsai_indexWidget.value = 1;
    state.suppressReset = false;
}

/**
 * BSAI Asset Library Auto List - Frontend Extension
 *
 * Adds a custom info display and Prev/Next/Reset buttons below all widgets.
 * Uses node.last_y (set by LiteGraph after drawing all widgets) to position
 * the custom UI below DOM widgets, preventing occlusion.
 * The index auto-increments after each execution.
 * Supports both BSAI_AssetLibraryAutoList and BSAI_AssetLibraryAutoListByType.
 */

import { app } from "../../../scripts/app.js";

const TARGET_NODES = new Set([
    "BSAI_AssetLibraryAutoList",
    "BSAI_AssetLibraryAutoListByType",
]);

// Height of our custom UI area
const CUSTOM_UI_HEIGHT = 56; // 20 info + 26 buttons + 10 padding

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

        // Add extra height for custom UI
        const origComputeSize = nodeType.prototype.computeSize;
        nodeType.prototype.computeSize = function (out) {
            const size = origComputeSize ? origComputeSize.apply(this, arguments) : [240, 120];
            size[1] += CUSTOM_UI_HEIGHT;
            return size;
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
        buttonRects: [],
        lastScript: node._bsai_scriptWidget?.value || "",
        lastMode: node._bsai_modeWidget?.value || "",
    };

    // Draw custom UI in onDrawForeground, which is called AFTER all widgets
    // are drawn by LiteGraph. node.last_y contains the y position after the
    // last widget, so we draw below that to avoid overlapping DOM widgets.
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
        node.setDirtyCanvas(true, true);
    }, 50);
}

function getCustomUIY(node) {
    // node.last_y is set by LiteGraph after drawing all widgets
    // It's the y position (relative to node top) after the last widget
    let y = node.last_y || 0;

    // If last_y is 0 or too small, fall back to a calculated value
    if (y < 10) {
        // Estimate: title height + widget count * avg widget height
        const widgetCount = node.widgets?.length || 0;
        y = 30 + widgetCount * 26;
    }

    return y;
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

    // Use node.last_y to position below all widgets
    const areaTop = getCustomUIY(node);

    // Layout: separator → info text → buttons
    const sepY = areaTop + 2;
    const infoY = areaTop + 8;
    const btnY = areaTop + 30;
    const btnHeight = 22;

    ctx.save();

    // Background panel
    ctx.fillStyle = "rgba(20, 28, 40, 0.9)";
    ctx.fillRect(0, areaTop, width, CUSTOM_UI_HEIGHT);

    // Separator line
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, sepY);
    ctx.lineTo(width - 8, sepY);
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

    ctx.fillStyle = "#9bc";
    ctx.font = "bold 11px sans-serif";
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
        ctx.strokeStyle = "#5a7aaa";
        ctx.lineWidth = 1;
        roundRect(ctx, b.x, btnY, btnWidth, btnHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#dde";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, b.x + btnWidth / 2, btnY + btnHeight / 2);
    });

    ctx.restore();

    // Ensure node is tall enough
    const requiredHeight = areaTop + CUSTOM_UI_HEIGHT + 8;
    if (node.size[1] < requiredHeight) {
        node.size[1] = requiredHeight;
    }
}

function handleMouseDown(node, pos) {
    const state = node._bsaiAutoListState;
    if (!state || !state.buttonRects || state.buttonRects.length === 0) return false;

    const [mx, my] = pos;
    const areaTop = getCustomUIY(node);

    // Only check clicks in our custom UI area (below all widgets)
    if (my < areaTop) return false;

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

    node._bsai_indexWidget.value = next;
}

function resetIndex(node) {
    if (!node._bsai_indexWidget) return;
    node._bsai_indexWidget.value = 1;
}

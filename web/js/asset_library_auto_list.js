/**
 * BSAI Asset Library Auto List - Frontend Extension
 *
 * Adds a custom info display and Prev/Next/Reset buttons below the
 * standard widgets. The index auto-increments after each execution.
 */

import { app } from "../../../scripts/app.js";

const TARGET_NODE = "BSAI_AssetLibraryAutoList";

// Extra height needed for custom UI (info line + buttons)
const EXTRA_UI_HEIGHT = 60; // 24 info + 4 button padding + 24 buttons + 8 bottom padding

app.registerExtension({
    name: "BSAI.AssetLibraryAutoList",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== TARGET_NODE) return;

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

        // Ensure custom UI area is included in node size
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
    };

    // Draw custom UI after standard widgets
    const origDraw = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        if (origDraw) origDraw.apply(this, arguments);
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
            updateTotal(node);
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

function updateTotal(node) {
    const state = node._bsaiAutoListState;
    if (!state) return;

    const scriptText = node._bsai_scriptWidget?.value || "";
    if (scriptText) {
        const matches = scriptText.match(/@图\d+/g);
        state.total = matches ? matches.length : 0;
    } else {
        state.total = 0;
    }
}

function drawCustomUI(ctx, node) {
    const state = node._bsaiAutoListState;
    if (!state) return;

    // Calculate position: just below the last widget
    // We need to find where widgets end
    const widgetY = getWidgetsBottom(node);
    const width = node.size[0];

    const infoY = widgetY + 6;
    const btnY = infoY + 28;

    // Draw separator line
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, widgetY + 2);
    ctx.lineTo(width - 8, widgetY + 2);
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
    const btnHeight = 22;
    const buttons = [
        { label: "◀ 上一个", x: 8, action: "prev" },
        { label: "重置 Reset", x: 12 + btnWidth, action: "reset" },
        { label: "下一个 ▶", x: 16 + btnWidth * 2, action: "next" },
    ];

    state.buttonRects = buttons.map(b => ({
        action: b.action,
        x: b.x,
        y: btnY,
        w: btnWidth,
        h: btnHeight,
    }));

    buttons.forEach(b => {
        // Button background
        ctx.fillStyle = "#2a3a5a";
        ctx.strokeStyle = "#4a6a9a";
        ctx.lineWidth = 1;
        roundRect(ctx, b.x, btnY, btnWidth, btnHeight, 3);
        ctx.fill();
        ctx.stroke();

        // Button text
        ctx.fillStyle = "#cde";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, b.x + btnWidth / 2, btnY + btnHeight / 2);
    });

    ctx.restore();
}

function getWidgetsBottom(node) {
    // Calculate the Y position just below the last widget
    // Start below title bar
    let y = LiteGraph.NODE_TITLE_HEIGHT + 8;
    for (const w of node.widgets) {
        if (w.name === "asset_list_info" || w.name === "asset_list_buttons") continue;
        const h = w.computeSize ? w.computeSize(node.size[0])[1] : 20;
        y += h + 4;
    }
    return y;
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

function handleMouseDown(node, pos) {
    const state = node._bsaiAutoListState;
    if (!state || !state.buttonRects) return false;

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

function incrementIndex(node, delta = 1) {
    const state = node._bsaiAutoListState;
    if (!state || !node._bsai_indexWidget) return;

    const current = parseInt(node._bsai_indexWidget.value) || 1;
    const total = state.total || 0;

    let next = current + delta;
    if (total > 0) {
        // Wrap around
        if (next > total) next = 1;
        if (next < 1) next = total;
    } else {
        next = Math.max(1, next);
    }

    node._bsai_indexWidget.value = next;
    if (node._bsai_indexWidget.callback) {
        node._bsai_indexWidget.callback(next);
    }
}

function resetIndex(node) {
    if (!node._bsai_indexWidget) return;
    node._bsai_indexWidget.value = 1;
    if (node._bsai_indexWidget.callback) {
        node._bsai_indexWidget.callback(1);
    }
}

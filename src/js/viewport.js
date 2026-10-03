// The game uses a stable 16:9 world coordinate space; CSS scales it to the page.
const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;

export function createViewport(canvas) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser does not support the 2D canvas API");

    let frameId;
    const resize = () => {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    };

    function render() {
        context.setTransform(canvas.width / WORLD_WIDTH, 0, 0, canvas.height / WORLD_HEIGHT, 0, 0);
        context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
        sky.addColorStop(0, "#203748");
        sky.addColorStop(1, "#111a23");
        context.fillStyle = sky;
        context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Temporary grid and ground clarify the 2D scene bounds without adding mechanics.
        context.strokeStyle = "rgba(204, 224, 238, 0.07)";
        context.lineWidth = 1;
        for (let x = 0; x <= WORLD_WIDTH; x += 48) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, WORLD_HEIGHT);
            context.stroke();
        }
        for (let y = 0; y <= WORLD_HEIGHT; y += 48) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(WORLD_WIDTH, y);
            context.stroke();
        }

        context.fillStyle = "#24343d";
        context.fillRect(0, 414, WORLD_WIDTH, 126);
        context.fillStyle = "#526b70";
        context.fillRect(0, 414, WORLD_WIDTH, 3);
        context.fillStyle = "rgba(232, 237, 244, 0.68)";
        context.font = "16px system-ui, sans-serif";
        context.textAlign = "center";
        context.fillText("SCENA GRY · 960 × 540", WORLD_WIDTH / 2, 486);

        // The frame hook is ready for future world updates and animation.
        frameId = window.requestAnimationFrame(render);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frameId = window.requestAnimationFrame(render);

    return {
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        destroy() {
            observer.disconnect();
            window.cancelAnimationFrame(frameId);
        },
    };
}

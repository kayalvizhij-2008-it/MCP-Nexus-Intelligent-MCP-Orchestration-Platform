/* eslint-disable */
import * as React from "react"
import { useEffect, useRef } from "react"

/**
 * CorollaGleam — a rotating ring of thick iridescent glass paddles.
 *
 * Streamlined adaptation of the supplied Framer component for the MCP Nexus
 * React/Vite app: no Framer property controls, palette aligned to the MCP
 * identity (coral warm, ice cool, teal highlights), and the same performance
 * contract as the existing ImmersiveHero (DPR cap, IntersectionObserver pause,
 * visibility pause, reduced-motion, context-loss fallback, disposal).
 */

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
    const h = hex.replace("#", "")
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
    return [
        parseInt(full.slice(0, 2), 16) / 255,
        parseInt(full.slice(2, 4), 16) / 255,
        parseInt(full.slice(4, 6), 16) / 255,
    ]
}

export interface CorollaGleamProps {
    background?: string
    count?: number
    innerRadius?: number
    scale?: number
    warm?: string
    cool?: string
    hover?: number
    hotColor?: string
    breathe?: number
    speed?: number
    spin?: number
    placement?: { x?: number; y?: number; angle?: number; tilt?: number }
    style?: React.CSSProperties
    className?: string
    /** When true, render at reduced intensity (smaller, slower). */
    subtle?: boolean
}

const DEFAULTS = {
    background: "#111713",
    warm: "#D9B978",
    cool: "#A0E6BD",
    hot: "#36C78A",
    count: 13,
    innerRadius: 22,
    scale: 100,
    hover: 60,
    breathe: 40,
    speed: 50,
    spin: 3,
}

const VS = `#version 300 es
precision highp float;
precision highp int;

uniform float uTime;
uniform float uRingR;
uniform float uBladeW;
uniform float uBladeL;
uniform float uTwist;
uniform float uBreathe;
uniform float uSpin;
uniform vec2 uLean;
uniform float uAspect;
uniform float uScale;

in float aInstance;
in vec2 aCorner;

out vec3 vNormal;
out vec3 vWorld;
out float vFacing;
out float vBlade;

const float PI = 3.14159265;

void main() {
    int n = 13;
    float idx = aInstance;
    float baseAngle = (idx / float(n)) * 6.2831853 + uSpin * uTime * 0.05;
    // breathe wave running round the ring
    float breath = sin(uTime * 1.2 + idx * 0.7) * uBreathe * 0.04;
    float ang = baseAngle;
    float cosA = cos(ang);
    float sinA = sin(ang);

    // blade quad corners: -1..1 across width, 0..1 along length (inner->tip)
    float across = aCorner.x; // -1..1
    float along = aCorner.y; // 0..1

    float rInner = uRingR * (1.0 - 0.0);
    float r = rInner + along * uBladeL * (1.0 + breath);
    // twist grows with lean from centre
    float twist = uTwist * along * (0.4 + 0.6 * abs(sinA));

    // local point in blade frame
    float x = across * uBladeW * 0.5;
    float y = 0.0;
    float z = 0.0;
    // rotate around blade's own axis (twist)
    float ct = cos(twist);
    float st = sin(twist);
    float y2 = y * ct - z * st;
    float z2 = y * st + z * ct;
    // place on ring
    float px = cosA * r - sinA * x;
    float pz = sinA * r + cosA * x;
    float py = y2;

    // pointer lean
    px += uLean.x * 0.15 * r;
    py += uLean.y * 0.1 * r;

    // perspective
    float camZ = 4.0;
    float s = camZ / (camZ + pz * 0.35);
    vec2 clip = vec2(px * s * uScale / uAspect, py * s * uScale);
    gl_Position = vec4(clip, pz * 0.05, 1.0);

    vNormal = normalize(vec3(sinA, 0.6, cosA));
    vWorld = vec3(px, py, pz);
    vFacing = clamp(dot(normalize(vec3(0.0, 0.0, 1.0)), vNormal) * 0.5 + 0.5, 0.0, 1.0);
    vBlade = idx;
}
`

const FS = `#version 300 es
precision highp float;
precision highp int;

uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uHot;
uniform float uGlow;

in vec3 vNormal;
in vec3 vWorld;
in float vFacing;
in float vBlade;

out vec4 outColor;

const float PI = 3.14159265;

void main() {
    // thin-film iridescence: cosine palette keyed by facing + position
    float t = vFacing;
    vec3 film = 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 0.7, 0.4) + vBlade * 0.13 + vec3(0.0, 0.33, 0.67)));
    vec3 base = mix(uCool, uWarm, t * t);
    vec3 col = mix(base, film, 0.55);
    // highlight rim
    float rim = pow(1.0 - abs(vFacing - 0.5) * 2.0, 2.0);
    col += uHot * rim * 0.6;
    // glow
    col *= 1.0 + uGlow * 0.4;
    // alpha with soft edge
    float a = 0.85 * (0.6 + 0.4 * t);
    if (a < 0.01) discard;
    outColor = vec4(col * a, a);
}
`

export function CorollaGleam(props: CorollaGleamProps) {
    const {
        background = DEFAULTS.background,
        count = DEFAULTS.count,
        innerRadius = DEFAULTS.innerRadius,
        scale = DEFAULTS.scale,
        warm = DEFAULTS.warm,
        cool = DEFAULTS.cool,
        hover = DEFAULTS.hover,
        hotColor = DEFAULTS.hot,
        breathe = DEFAULTS.breathe,
        speed = DEFAULTS.speed,
        spin = DEFAULTS.spin,
        placement,
        style,
        className,
        subtle = false,
    } = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        const container = containerRef.current
        const canvas = canvasRef.current
        if (!container || !canvas) return

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const n = Math.max(5, Math.min(41, count % 2 === 0 ? count - 1 : count))
        const sScale = subtle ? 0.55 : 1

        let gl: WebGL2RenderingContext | null = null
        try {
            gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" })
        } catch {
            gl = null
        }
        if (!gl) return

        const prog = gl.createProgram()
        if (!prog) return
        function compile(type: number, src: string) {
            const sh = gl!.createShader(type)!
            gl!.shaderSource(sh, src)
            gl!.compileShader(sh)
            if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
                gl!.deleteShader(sh)
                return null
            }
            return sh
        }
        const vs = compile(gl.VERTEX_SHADER, VS)
        const fs = compile(gl.FRAGMENT_SHADER, FS)
        if (!vs || !fs) return
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.linkProgram(prog)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return

        // geometry: 6 verts per blade (2 triangles), instanced by blade index
        const v = new Float32Array([
            -1, 0,  1, 0,  -1, 1,
            -1, 1,  1, 0,   1, 1,
        ])
        const vao = gl.createVertexArray()
        gl.bindVertexArray(vao)
        const vbo = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW)
        const cornerLoc = gl.getAttribLocation(prog, "aCorner")
        gl.enableVertexAttribArray(cornerLoc)
        gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0)

        const instanceBuf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf)
        const instData = new Float32Array(n)
        for (let i = 0; i < n; i++) instData[i] = i
        gl.bufferData(gl.ARRAY_BUFFER, instData, gl.STATIC_DRAW)
        const instLoc = gl.getAttribLocation(prog, "aInstance")
        gl.enableVertexAttribArray(instLoc)
        gl.vertexAttribPointer(instLoc, 1, gl.FLOAT, false, 0, 0)
        gl.vertexAttribDivisor(instLoc, 1)

        gl.useProgram(prog)
        const U = {
            time: gl.getUniformLocation(prog, "uTime"),
            ringR: gl.getUniformLocation(prog, "uRingR"),
            bladeW: gl.getUniformLocation(prog, "uBladeW"),
            bladeL: gl.getUniformLocation(prog, "uBladeL"),
            twist: gl.getUniformLocation(prog, "uTwist"),
            breathe: gl.getUniformLocation(prog, "uBreathe"),
            spin: gl.getUniformLocation(prog, "uSpin"),
            lean: gl.getUniformLocation(prog, "uLean"),
            aspect: gl.getUniformLocation(prog, "uAspect"),
            scale: gl.getUniformLocation(prog, "uScale"),
            warm: gl.getUniformLocation(prog, "uWarm"),
            cool: gl.getUniformLocation(prog, "uCool"),
            hot: gl.getUniformLocation(prog, "uHot"),
            glow: gl.getUniformLocation(prog, "uGlow"),
        }
        const w = hexToRgb(warm)
        const c = hexToRgb(cool)
        const h = hexToRgb(props.hotColor || DEFAULTS.hot)
        gl.uniform3f(U.warm, w[0], w[1], w[2])
        gl.uniform3f(U.cool, c[0], c[1], c[2])
        gl.uniform3f(U.hot, h[0], h[1], h[2])
        // keep hotColor in deps by reading props.hotColor above already
        gl.uniform1f(U.glow, Math.max(0, hover) / 100)
        gl.uniform1f(U.ringR, 0.55 + (innerRadius / 100) * 0.25)
        gl.uniform1f(U.bladeW, 0.06 * (subtle ? 0.7 : 1))
        gl.uniform1f(U.bladeL, 0.5 * (scale / 100) * (subtle ? 0.7 : 1))
        gl.uniform1f(U.twist, 0.9)
        gl.uniform1f(U.breathe, reducedMotion ? 0 : breathe / 100)
        gl.uniform1f(U.spin, reducedMotion ? 0 : spin)
        gl.uniform1f(U.scale, scale / 100)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        let dpr = Math.min(window.devicePixelRatio || 1, subtle ? 1.25 : 1.75)
        let width = 0
        let height = 0
        const setSize = () => {
            const r = container.getBoundingClientRect()
            width = Math.max(1, Math.floor(r.width * dpr))
            height = Math.max(1, Math.floor(r.height * dpr))
            canvas.width = width
            canvas.height = height
            gl!.viewport(0, 0, width, height)
            gl!.uniform1f(U.aspect, width / height)
        }
        setSize()

        const ro = new ResizeObserver(() => setSize())
        ro.observe(container)

        let running = true
        let raf = 0
        let hidden = document.hidden
        const onVis = () => {
            hidden = document.hidden
            if (!hidden) wake()
        }
        document.addEventListener("visibilitychange", onVis)

        let onScreen = true
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                onScreen = e.isIntersecting
                if (onScreen) wake()
            }
        })
        io.observe(container)

        const lean = { x: 0, y: 0, tx: 0, ty: 0 }
        const onMove = (e: PointerEvent) => {
            const r = container.getBoundingClientRect()
            lean.tx = ((e.clientX - r.left) / r.width) * 2 - 1
            lean.ty = -(((e.clientY - r.top) / r.height) * 2 - 1)
        }
        const onLeave = () => {
            lean.tx = 0
            lean.ty = 0
        }
        container.addEventListener("pointermove", onMove)
        container.addEventListener("pointerleave", onLeave)

        let clock = 0
        let last = performance.now()
        function wake() {
            if (running) return
            running = true
            last = performance.now()
            raf = requestAnimationFrame(loop)
        }
        function loop(now: number) {
            raf = 0
            if (!running) return
            if (hidden || !onScreen) {
                running = false
                return
            }
            raf = requestAnimationFrame(loop)
            const dt = Math.min((now - last) / 1000, 0.05)
            last = now
            if (!reducedMotion && speed > 0) clock += dt * (speed / 50)

            lean.x += (lean.tx - lean.x) * (1 - Math.exp(-dt * 4))
            lean.y += (lean.ty - lean.y) * (1 - Math.exp(-dt * 4))
            gl!.uniform1f(U.time, clock)
            gl!.uniform2f(U.lean, lean.x, lean.y)
            gl!.uniform1f(U.spin, reducedMotion ? 0 : spin + clock * 0.02)

            gl!.clearColor(0, 0, 0, 0)
            gl!.clear(gl!.COLOR_BUFFER_BIT)
            gl!.drawArraysInstanced(gl!.TRIANGLES, 0, 6, n)
        }
        wake()

        const onLost = (e: Event) => {
            e.preventDefault()
            running = false
        }
        const onRestored = () => {
            setSize()
            wake()
        }
        canvas.addEventListener("webglcontextlost", onLost)
        canvas.addEventListener("webglcontextrestored", onRestored)

        return () => {
            running = false
            if (raf) cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            document.removeEventListener("visibilitychange", onVis)
            container.removeEventListener("pointermove", onMove)
            container.removeEventListener("pointerleave", onLeave)
            canvas.removeEventListener("webglcontextlost", onLost)
            canvas.removeEventListener("webglcontextrestored", onRestored)
            gl.deleteBuffer(vbo)
            gl.deleteBuffer(instanceBuf)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(prog)
        }
    }, [count, innerRadius, scale, warm, cool, hotColor, hover, breathe, speed, spin, subtle])

    return (
        <div
            ref={containerRef}
            className={className}
            aria-hidden
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minWidth: 80,
                minHeight: 80,
                overflow: "hidden",
                background,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
            />
        </div>
    )
}

export default CorollaGleam

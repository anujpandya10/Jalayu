'use client'

import { useEffect, useRef } from 'react'

export type OrbState = 'idle' | 'listening' | 'speaking'

// Planet definitions: color, orbit semi-axes (relative), tilt, orbital speed factor, size range
const PLANETS = [
  { color: '#C4B5A5', glowColor: 'rgba(196,181,165,0.7)', a: 0.72, b: 0.22, tilt: -18, speed: 1.0, rMin: 3.8, rMax: 5.2 },
  { color: '#9B8EA0', glowColor: 'rgba(155,142,160,0.7)', a: 0.58, b: 0.17, tilt: 28,  speed: 1.55, rMin: 2.8, rMax: 3.8 },
  { color: '#B8C4A0', glowColor: 'rgba(184,196,160,0.7)', a: 0.86, b: 0.30, tilt: -8,  speed: 0.65, rMin: 4.5, rMax: 6.2 },
]

const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: (Math.sin(i * 137.508 * Math.PI / 180) * 0.5 + 0.5),
  y: (Math.cos(i * 97.38 * Math.PI / 180) * 0.5 + 0.5),
  r: 0.5 + (i % 3) * 0.4,
  opacity: 0.3 + (i % 5) * 0.12,
  twinklePeriod: 2200 + (i % 7) * 600,
  twinkleOffset: i * 341,
}))

interface Props {
  state?: OrbState
  size?: number
}

export default function GalaxyOrb({ state = 'idle', size = 180 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const rafRef = useRef<number>(0)
  const anglesRef = useRef(PLANETS.map((_, i) => (i * Math.PI * 2) / PLANETS.length))
  const stateRef = useRef(state)

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const cx = size / 2
    const cy = size / 2
    const R = size / 2

    // Create or retrieve DOM groups
    const getOrCreate = (id: string, tag: string, parent: SVGElement) => {
      let el = svg.getElementById(id)
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', tag)
        el.setAttribute('id', id)
        parent.appendChild(el)
      }
      return el
    }

    // Layers
    const backLayer = getOrCreate('galaxy-back', 'g', svg) as SVGGElement
    const orbLayer = getOrCreate('galaxy-orb-layer', 'g', svg) as SVGGElement
    const frontLayer = getOrCreate('galaxy-front', 'g', svg) as SVGGElement

    // -- Build orb sphere (once)
    if (!svg.getElementById('orb-sphere')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

      // Radial gradient for orb body
      const orbGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient')
      orbGrad.setAttribute('id', 'orbGrad')
      orbGrad.setAttribute('cx', '38%')
      orbGrad.setAttribute('cy', '35%')
      orbGrad.setAttribute('r', '68%')
      orbGrad.setAttribute('fx', '38%')
      orbGrad.setAttribute('fy', '35%')
      const stops = [
        ['0%', '#58504C', '1'],
        ['40%', '#3A3430', '1'],
        ['100%', '#1C1917', '1'],
      ]
      stops.forEach(([offset, color, opacity]) => {
        const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
        stop.setAttribute('offset', offset)
        stop.setAttribute('stop-color', color)
        stop.setAttribute('stop-opacity', opacity)
        orbGrad.appendChild(stop)
      })

      // Clip path for orb
      const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
      clip.setAttribute('id', 'orbClip')
      const clipCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      clipCircle.setAttribute('cx', String(cx))
      clipCircle.setAttribute('cy', String(cy))
      clipCircle.setAttribute('r', String(R - 1))
      clip.appendChild(clipCircle)

      // Glow filter
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
      filter.setAttribute('id', 'planetGlow')
      filter.setAttribute('x', '-50%')
      filter.setAttribute('y', '-50%')
      filter.setAttribute('width', '200%')
      filter.setAttribute('height', '200%')
      const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur')
      blur.setAttribute('stdDeviation', '2.5')
      blur.setAttribute('result', 'blur')
      filter.appendChild(blur)
      const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite')
      composite.setAttribute('in', 'SourceGraphic')
      composite.setAttribute('in2', 'blur')
      composite.setAttribute('operator', 'over')
      filter.appendChild(composite)

      defs.appendChild(orbGrad)
      defs.appendChild(clip)
      defs.appendChild(filter)
      svg.insertBefore(defs, svg.firstChild)

      // Orb group (sphere + globe lines + specular)
      const orbGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      orbGroup.setAttribute('id', 'orb-sphere')
      orbGroup.setAttribute('clip-path', 'url(#orbClip)')

      // Main sphere fill
      const sphere = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      sphere.setAttribute('cx', String(cx))
      sphere.setAttribute('cy', String(cy))
      sphere.setAttribute('r', String(R - 1))
      sphere.setAttribute('fill', 'url(#orbGrad)')
      orbGroup.appendChild(sphere)

      // Stars layer
      STARS.forEach((s) => {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        star.setAttribute('cx', String(s.x * size))
        star.setAttribute('cy', String(s.y * size))
        star.setAttribute('r', String(s.r))
        star.setAttribute('fill', '#F5F3EE')
        star.setAttribute('opacity', String(s.opacity))
        star.setAttribute('data-star', 'true')
        star.setAttribute('data-period', String(s.twinklePeriod))
        star.setAttribute('data-offset', String(s.twinkleOffset))
        orbGroup.appendChild(star)
      })

      // Globe latitude lines (faint)
      const glLines = [
        [cx, cy, R * 0.95, R * 0.22],
        [cx, cy, R * 0.95, R * 0.52],
        [cx, cy * 0.5, R * 0.55, R * 0.14],
        [cx, cy * 1.5, R * 0.55, R * 0.14],
      ]
      glLines.forEach(([ex, ey, rx, ry]) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
        el.setAttribute('cx', String(ex))
        el.setAttribute('cy', String(ey))
        el.setAttribute('rx', String(rx))
        el.setAttribute('ry', String(ry))
        el.setAttribute('fill', 'none')
        el.setAttribute('stroke', '#F5F3EE')
        el.setAttribute('stroke-width', '0.5')
        el.setAttribute('opacity', '0.09')
        orbGroup.appendChild(el)
      })

      // Specular highlight
      const spec = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
      spec.setAttribute('cx', String(cx * 0.75))
      spec.setAttribute('cy', String(cy * 0.6))
      spec.setAttribute('rx', String(R * 0.26))
      spec.setAttribute('ry', String(R * 0.14))
      spec.setAttribute('fill', 'rgba(255,255,255,0.12)')
      spec.setAttribute('transform', `rotate(-30 ${cx} ${cy})`)
      orbGroup.appendChild(spec)

      // Rim light (subtle)
      const rim = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      rim.setAttribute('cx', String(cx))
      rim.setAttribute('cy', String(cy))
      rim.setAttribute('r', String(R - 1))
      rim.setAttribute('fill', 'none')
      rim.setAttribute('stroke', 'rgba(255,255,255,0.06)')
      rim.setAttribute('stroke-width', '2')
      orbGroup.appendChild(rim)

      orbLayer.appendChild(orbGroup)
    }

    // Pre-create back/front planet elements (2 per planet: glow + dot)
    const planetBackEls: SVGCircleElement[][] = []
    const planetFrontEls: SVGCircleElement[][] = []

    PLANETS.forEach((p, i) => {
      // Back glow + dot
      const backGlow = (svg.getElementById(`bp-glow-${i}`) as SVGCircleElement) ||
        (() => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          el.setAttribute('id', `bp-glow-${i}`)
          el.setAttribute('fill', p.glowColor)
          backLayer.appendChild(el)
          return el
        })()
      const backDot = (svg.getElementById(`bp-dot-${i}`) as SVGCircleElement) ||
        (() => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          el.setAttribute('id', `bp-dot-${i}`)
          el.setAttribute('fill', p.color)
          backLayer.appendChild(el)
          return el
        })()
      planetBackEls.push([backGlow, backDot])

      // Front glow + dot
      const frontGlow = (svg.getElementById(`fp-glow-${i}`) as SVGCircleElement) ||
        (() => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          el.setAttribute('id', `fp-glow-${i}`)
          el.setAttribute('fill', p.glowColor)
          frontLayer.appendChild(el)
          return el
        })()
      const frontDot = (svg.getElementById(`fp-dot-${i}`) as SVGCircleElement) ||
        (() => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          el.setAttribute('id', `fp-dot-${i}`)
          el.setAttribute('fill', p.color)
          frontLayer.appendChild(el)
          return el
        })()
      planetFrontEls.push([frontGlow, frontDot])
    })

    let lastTs = 0

    const tick = (ts: number) => {
      const dt = Math.min(ts - lastTs, 50) / 1000
      lastTs = ts

      const s = stateRef.current
      const speedMult = s === 'speaking' ? 2.2 : s === 'listening' ? 1.45 : 1.0

      PLANETS.forEach((p, i) => {
        anglesRef.current[i] += p.speed * speedMult * dt * 0.55

        const angle = anglesRef.current[i]
        const tiltRad = p.tilt * Math.PI / 180

        // 3D orbital position
        const lx = p.a * R * Math.cos(angle)
        const ly = p.b * R * Math.sin(angle)

        // Rotate by tilt
        const x = cx + lx * Math.cos(tiltRad) - ly * Math.sin(tiltRad)
        const y = cy + lx * Math.sin(tiltRad) + ly * Math.cos(tiltRad)

        // Depth: sin of the original angle (before tilt rotation)
        const depth = Math.sin(angle)

        // Planet size varies slightly by depth
        const r = p.rMin + (p.rMax - p.rMin) * ((depth + 1) / 2)

        // Opacity also varies by depth
        const dotOpacity = 0.55 + 0.45 * ((depth + 1) / 2)
        const glowOpacity = 0.3 + 0.3 * ((depth + 1) / 2)

        const [backGlow, backDot] = planetBackEls[i]
        const [frontGlow, frontDot] = planetFrontEls[i]

        if (depth < 0) {
          // Behind the orb — show in back layer, hide front
          backGlow.setAttribute('cx', String(x))
          backGlow.setAttribute('cy', String(y))
          backGlow.setAttribute('r', String(r * 2.2))
          backGlow.setAttribute('opacity', String(glowOpacity * 0.4))
          backDot.setAttribute('cx', String(x))
          backDot.setAttribute('cy', String(y))
          backDot.setAttribute('r', String(r * 0.7))
          backDot.setAttribute('opacity', String(dotOpacity * 0.4))
          frontGlow.setAttribute('opacity', '0')
          frontDot.setAttribute('opacity', '0')
        } else {
          // In front of the orb
          frontGlow.setAttribute('cx', String(x))
          frontGlow.setAttribute('cy', String(y))
          frontGlow.setAttribute('r', String(r * 2.8))
          frontGlow.setAttribute('opacity', String(glowOpacity))
          frontDot.setAttribute('cx', String(x))
          frontDot.setAttribute('cy', String(y))
          frontDot.setAttribute('r', String(r))
          frontDot.setAttribute('opacity', String(dotOpacity))
          backGlow.setAttribute('opacity', '0')
          backDot.setAttribute('opacity', '0')
        }
      })

      // Star twinkle
      const starEls = svg.querySelectorAll('[data-star]')
      starEls.forEach((el) => {
        const period = parseFloat(el.getAttribute('data-period') || '3000')
        const offset = parseFloat(el.getAttribute('data-offset') || '0')
        const baseOpacity = parseFloat(el.getAttribute('opacity') || '0.4')
        const phase = ((ts + offset) % period) / period
        const twinkle = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
        ;(el as SVGCircleElement).setAttribute('opacity', String(baseOpacity * (0.6 + 0.4 * twinkle)))
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [size])

  const glowIntensity = state === 'speaking' ? 0.28 : state === 'listening' ? 0.18 : 0.1

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        margin: '0 auto 28px',
        transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: state === 'speaking' ? 'scale(1.09)' : state === 'listening' ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      {/* Ambient glow ring */}
      <div
        style={{
          position: 'absolute',
          inset: -18,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(41,37,36,${glowIntensity}) 0%, transparent 70%)`,
          transition: 'background 0.8s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Sonar pulse rings */}
      {state !== 'idle' && (
        <>
          <div
            key="sonar-1"
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              border: '1px solid rgba(120,113,108,0.25)',
              animation: 'galaxySonar 2s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            key="sonar-2"
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              border: '1px solid rgba(120,113,108,0.18)',
              animation: 'galaxySonar 2s ease-out 0.7s infinite',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* The galaxy SVG */}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', borderRadius: '50%', overflow: 'hidden' }}
      />
    </div>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

export function SmoothScroll({
  children,
  paused = false,
}: {
  children: ReactNode
  paused?: boolean
}) {
  const lenisRef = useRef<Lenis | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    if (paused) lenisRef.current?.stop()
    else lenisRef.current?.start()
  }, [paused])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let cleanup = () => {}
    let activeLenis: Lenis | undefined
    const navigate = (event: Event) => {
      const { progress, immediate } = (
        event as CustomEvent<{ progress: number; immediate: boolean }>
      ).detail
      const top =
        Math.max(0, Math.min(1, progress)) *
        (document.documentElement.scrollHeight - window.innerHeight)
      if (activeLenis) activeLenis.scrollTo(top, { immediate, duration: 1.3 })
      else window.scrollTo({ top, behavior: 'instant' })
    }
    const setup = () => {
      cleanup()
      if (media.matches) return
      const lenis = new Lenis({
        duration: 1.15,
        smoothWheel: true,
        anchors: { offset: 0 },
        autoRaf: false,
      })
      activeLenis = lenis
      lenisRef.current = lenis
      if (pausedRef.current) lenis.stop()
      const tick = (time: number) => lenis.raf(time * 1000)
      lenis.on('scroll', ScrollTrigger.update)
      gsap.ticker.add(tick)
      cleanup = () => {
        gsap.ticker.remove(tick)
        lenis.destroy()
        activeLenis = undefined
        lenisRef.current = null
      }
    }
    setup()
    window.addEventListener('ghostshield:seek', navigate)
    media.addEventListener('change', setup)
    return () => {
      cleanup()
      window.removeEventListener('ghostshield:seek', navigate)
      media.removeEventListener('change', setup)
    }
  }, [])
  return children
}

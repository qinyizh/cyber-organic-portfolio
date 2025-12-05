import { Canvas, useFrame } from '@react-three/fiber'
import { Icosahedron, MeshDistortMaterial } from '@react-three/drei'
// 修复 1：使用 type 关键字导入类型，满足 verbatimModuleSyntax 规则
import { useRef, useState, useEffect, type MutableRefObject } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import * as Tone from 'tone'
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'

gsap.registerPlugin(ScrollTrigger)

// --- 音频系统 (全局单例) ---
const audioSystem = {
  heart: null as Tone.MembraneSynth | null,
  blood: null as Tone.NoiseSynth | null,
  distortion: null as Tone.Distortion | null,
  reverb: null as Tone.Reverb | null,
  loop: null as Tone.Loop | null,
  isReady: false
}

const initAudio = async (beatSignalRef: MutableRefObject<boolean>) => {
  if (audioSystem.isReady) return

  await Tone.start()
  
  const compressor = new Tone.Compressor({
    threshold: -20,
    ratio: 3,
  }).toDestination()

  const reverb = new Tone.Reverb({ 
    decay: 5, 
    preDelay: 0.1, 
    wet: 0.3 
  }).connect(compressor)
  await reverb.generate()

  const distortion = new Tone.Distortion(0).connect(reverb)
  const lowPass = new Tone.Filter(600, "lowpass").connect(distortion)

  const heart = new Tone.MembraneSynth({
    volume: 0, 
    pitchDecay: 0.1, 
    octaves: 3, 
    oscillator: { type: "sine" }, 
    envelope: {
      attack: 0.001,
      decay: 0.4,
      sustain: 0.01,
      release: 1, 
      attackCurve: "exponential"
    }
  }).connect(lowPass)

  const blood = new Tone.NoiseSynth({
    volume: -15, 
    noise: { type: "brown" },
    envelope: {
      attack: 0.01,
      decay: 0.3, 
      sustain: 0
    }
  }).connect(lowPass)

  const loop = new Tone.Loop((time) => {
    heart.triggerAttackRelease("C0", "4n", time)
    blood.triggerAttackRelease("8n", time) 
    if (beatSignalRef) beatSignalRef.current = true
  }, "4n").start(0)

  Tone.Transport.bpm.value = 60
  Tone.Transport.start()

  audioSystem.heart = heart
  audioSystem.blood = blood
  audioSystem.distortion = distortion
  audioSystem.reverb = reverb
  audioSystem.loop = loop
  audioSystem.isReady = true
  
  console.log("Cinematic Audio System Online 🎬")
}

const Model = ({ beatSignalRef }: { beatSignalRef: MutableRefObject<boolean> }) => {
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<any>(null)
  const wireframeRef = useRef<THREE.Mesh>(null)
  const currentScaleRef = useRef(1)
  
  const visualParams = useRef({
    color: '#ffffff', 
    distort: 0.3,
    opacity: 0.5
  })

  const audioParams = useRef({ bpm: 60, distort: 0, reverbWet: 0.3 })

  useFrame((state, delta) => {
    if (!groupRef.current) return

    if (beatSignalRef.current) {
        currentScaleRef.current = 1.3
        beatSignalRef.current = false
    }
    const safeDelta = Math.min(delta, 0.1) 
    currentScaleRef.current = THREE.MathUtils.lerp(currentScaleRef.current, 1, safeDelta * 8)
    groupRef.current.scale.setScalar(currentScaleRef.current)

    if (materialRef.current) {
      materialRef.current.color.set(visualParams.current.color)
      materialRef.current.opacity = visualParams.current.opacity
      materialRef.current.distort = visualParams.current.distort
      materialRef.current.speed = audioParams.current.bpm / 30
    }

    if (wireframeRef.current) {
      wireframeRef.current.rotation.y = -state.clock.getElapsedTime() * 0.1
      wireframeRef.current.rotation.x = state.clock.getElapsedTime() * 0.1
    }

    if (audioSystem.isReady) {
      Tone.Transport.bpm.value = audioParams.current.bpm
      if (audioSystem.distortion) audioSystem.distortion.distortion = audioParams.current.distort
      if (audioSystem.reverb && audioSystem.reverb.wet) audioSystem.reverb.wet.value = audioParams.current.reverbWet
    }
  })

  useGSAP(() => {
    // 修复 2：增加 !wireframeRef.current 检查，防止 TS 报错 "possibly null"
    if (!groupRef.current || !wireframeRef.current) return

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#content-container',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1, 
      },
    })

    // --- Stage 1 ---
    tl.to(groupRef.current.position, { z: 1.5, x: 0.5, duration: 1 })
      .fromTo(visualParams.current, 
        { color: '#ffffff', opacity: 0.5, distort: 0.3 }, 
        { color: '#4ecdc4', opacity: 0.8, distort: 0.8, duration: 1 },
        '<'
      )
      .to(groupRef.current.rotation, { y: Math.PI, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 100, duration: 1 }, '<')

    // --- Stage 2 ---
    tl.to(groupRef.current.position, { x: -1.5, duration: 1 })
      .to(visualParams.current, { 
        distort: 1.5, 
        color: '#ff6b6b', 
        opacity: 0.95, 
        duration: 1 
      }, '<')
      .to(wireframeRef.current.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 180, distort: 0.8, duration: 1 }, '<')

    // --- Stage 3 ---
    tl.to(groupRef.current.position, { x: 0, z: 0, duration: 1 })
      .to(visualParams.current, { 
        distort: 0, 
        color: '#ffffff', 
        opacity: 0.3, 
        duration: 1 
      }, '<')
      .to(wireframeRef.current.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 30, distort: 0, reverbWet: 1, duration: 1 }, '<')

  }, [])

  return (
    <group ref={groupRef}>
      <Icosahedron args={[1, 8]}>
        <MeshDistortMaterial
          ref={materialRef}
          transparent={true}
          opacity={0.5}
          color="#ffffff"
          
          envMapIntensity={1.5} 
          metalness={0.1}       
          roughness={0.7}       
          clearcoat={0}         
          
          distort={0.3}
          speed={2}
        />
      </Icosahedron>
      <mesh ref={wireframeRef} scale={[1.05, 1.05, 1.05]}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color="white" wireframe transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)
  const beatSignalRef = useRef(false)

  const handleStart = () => {
    initAudio(beatSignalRef)
    setStarted(true)
  }

  useEffect(() => {
    return () => {
      Tone.Transport.stop()
      Tone.Transport.cancel()
      if (audioSystem.loop) audioSystem.loop.dispose()
      audioSystem.isReady = false
      console.log("System Cleanup Complete 🔴")
    }
  }, [])

  return (
    <>
      {!started && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          background: 'rgba(0,0,0,0.9)', zIndex: 100, 
          display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column',
          color: 'white', cursor: 'pointer', fontFamily: 'monospace'
        }} onClick={handleStart}>
          <h1 style={{fontSize: '2rem'}}>SYSTEM OFFLINE</h1>
          <p>[ CLICK TO INITIALIZE ]</p>
        </div>
      )}

      <div id="canvas-container">
        <Canvas 
          dpr={[1, 1.5]} 
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ position: [0, 0, 5], fov: 45 }}
        >
          <color attach="background" args={['#050505']} />
          
          <ambientLight intensity={0.5} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1} 
          />
          
          <Model beatSignalRef={beatSignalRef} />

          <EffectComposer disableNormalPass multisampling={0}>
            <Bloom 
              luminanceThreshold={0.9} 
              mipmapBlur 
              intensity={0.5} 
              radius={0.6} 
            />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
      </div>

      <div id="content-container">
        
        {/* 第一屏 */}
        <section className="section left">
          <div style={{ maxWidth: '600px' }}>
            <h3 style={{ fontSize: '1.5rem', opacity: 0.7, marginBottom: '1rem', fontFamily: 'monospace' }}>
              HELLO, I'M A CREATIVE DEV
            </h3>
            <h1 style={{ fontSize: '5rem', margin: 0, lineHeight: 1 }}>
              Digital <br/> Alchemist.
            </h1>
            <p style={{ opacity: 0.6, marginTop: '2rem', fontSize: '1.2rem', lineHeight: 1.6 }}>
              I blend code, visual art, and sound to craft immersive web experiences that breathe.
            </p>
          </div>
        </section>

        {/* 第二屏 */}
        <section className="section right">
          <div style={{ maxWidth: '600px', textAlign: 'right' }}>
            <h3 style={{ fontSize: '1.5rem', opacity: 0.7, marginBottom: '1rem', fontFamily: 'monospace' }}>
              THE TOOLKIT
            </h3>
            <h1 style={{ fontSize: '4rem', margin: 0, color: '#4ecdc4' }}>
              Engineering <br/> Flow.
            </h1>
            <p style={{ opacity: 0.6, marginTop: '2rem', fontSize: '1.2rem' }}>
              React / TypeScript / Next.js <br/>
              WebGL / Three.js / GLSL <br/>
              Node.js / System Architecture
            </p>
          </div>
        </section>

        {/* 第三屏 */}
        <section className="section center">
          <div style={{ maxWidth: '800px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.5rem', opacity: 0.7, marginBottom: '1rem', fontFamily: 'monospace', color: '#ff6b6b' }}>
              THE CHALLENGE
            </h3>
            <h1 style={{ fontSize: '6rem', margin: 0, color: '#ff6b6b' }}>
              Embrace <br/> Complexity.
            </h1>
            <p style={{ opacity: 0.8, marginTop: '2rem', fontSize: '1.5rem', maxWidth: '600px', margin: '2rem auto' }}>
              When systems break and deadlines loom, I find clarity in the chaos. I turn bugs into features and bottlenecks into breakthroughs.
            </p>
          </div>
        </section>

        {/* 第四屏 */}
        <section className="section center">
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '4rem', margin: 0 }}>
              Simplicity <br/> Restored.
            </h1>
            <p style={{ opacity: 0.6, marginTop: '1rem', fontFamily: 'monospace' }}>
              Let's build something timeless.
            </p>
            <button style={{
              marginTop: '3rem',
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              background: 'white',
              color: 'black',
              border: 'none',
              borderRadius: '50px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }} onClick={() => alert("这里可以链接到你的 Email 或 Resume")}>
              Get in Touch
            </button>
          </div>
        </section>

      </div>
    </>
  )
}
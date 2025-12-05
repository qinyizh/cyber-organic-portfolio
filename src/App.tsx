import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Icosahedron, MeshDistortMaterial } from '@react-three/drei'
import { useRef, useState, useEffect, MutableRefObject } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import * as Tone from 'tone'
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing'

gsap.registerPlugin(ScrollTrigger)

// --- 音频系统 (全局单例) ---
// --- 升级后的音频系统 ---
const audioSystem = {
  heart: null as Tone.MembraneSynth | null, // 核心跳动
  blood: null as Tone.NoiseSynth | null,    // 血液流动声 (质感来源)
  distortion: null as Tone.Distortion | null,
  reverb: null as Tone.Reverb | null,
  loop: null as Tone.Loop | null,
  isReady: false
}

const initAudio = async (beatSignalRef: MutableRefObject<boolean>) => {
  if (audioSystem.isReady) return

  await Tone.start()
  
  // 1. 总线效果器 (Master Bus FX)
  // 压缩器 (Compressor): 像胶水一样把两个声音粘在一起，增加紧实感
  const compressor = new Tone.Compressor({
    threshold: -20,
    ratio: 3,
  }).toDestination()

  // 混响 (Reverb): 增加 preDelay 让声音更清晰，decay 加长增加深邃感
  const reverb = new Tone.Reverb({ 
    decay: 5, 
    preDelay: 0.1, // 关键：让声音先出来，再有混响，避免浑浊
    wet: 0.3 
  }).connect(compressor)
  await reverb.generate()

  // 失真 (Distortion): 还是为了 Chaos 阶段准备
  const distortion = new Tone.Distortion(0).connect(reverb)
  
  // 低通滤波器 (LowPass): 去掉高频刺耳的电子味，让声音变闷、变暖
  const lowPass = new Tone.Filter(600, "lowpass").connect(distortion)


  // 2. Layer A: The Heart (核心低音)
  // 我们把音调调得更低，更有弹性
  const heart = new Tone.MembraneSynth({
    volume: 0, // 基础音量
    pitchDecay: 0.1, // 音高下潜速度减慢，增加重量感
    octaves: 3, // 下潜深度减少，不那么像电子鼓
    oscillator: { type: "sine" }, // 正弦波最纯净
    envelope: {
      attack: 0.001,
      decay: 0.4,
      sustain: 0.01,
      release: 1, // 尾音留长一点，更有余韵
      attackCurve: "exponential"
    }
  }).connect(lowPass) // 连到低通滤波器，过滤掉电子杂音


  // 3. Layer B: The Blood (血液流动的质感) 🌟 关键提升点
  // 使用 NoiseSynth 产生噪音，模拟液体流动的“沙沙”声
  const blood = new Tone.NoiseSynth({
    volume: -15, // 声音要小，作为衬托
    noise: { 
      type: "brown" // Brown Noise 比 White Noise 更深沉、温暖
    },
    envelope: {
      attack: 0.01,
      decay: 0.3, // 比心跳稍微短一点
      sustain: 0
    }
  }).connect(lowPass) // 同样过滤，只留低频的涌动感


  // 4. 循环触发逻辑
  const loop = new Tone.Loop((time) => {
    // 同时触发两个声音
    // C0 是非常低的音，接近人的听觉下限，会震动胸腔
    heart.triggerAttackRelease("C0", "4n", time)
    blood.triggerAttackRelease("8n", time) // 触发噪音层
    
    // 视觉信号
    if (beatSignalRef) beatSignalRef.current = true
  }, "4n").start(0)


  // 5. 启动
  Tone.Transport.bpm.value = 60
  Tone.Transport.start()

  // 保存引用
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
    // 🛠️ 改回月光白
    color: '#ffffff', 
    distort: 0.3,
    opacity: 0.5
  })
  // 音频参数代理
  const audioParams = useRef({ bpm: 60, distort: 0, reverbWet: 0.3 })

  useFrame((state, delta) => {
    if (!groupRef.current) return

    // 1. 心跳跳动逻辑
    if (beatSignalRef.current) {
        currentScaleRef.current = 1.3
        beatSignalRef.current = false
    }
    const safeDelta = Math.min(delta, 0.1) 
    currentScaleRef.current = THREE.MathUtils.lerp(currentScaleRef.current, 1, safeDelta * 8)
    groupRef.current.scale.setScalar(currentScaleRef.current)

    // 2. 视觉应用
    if (materialRef.current) {
      materialRef.current.color.set(visualParams.current.color)
      materialRef.current.opacity = visualParams.current.opacity
      materialRef.current.distort = visualParams.current.distort
      // 液体速度始终跟随 BPM (即使静音时也要有视觉反馈)
      materialRef.current.speed = audioParams.current.bpm / 30
    }

    // 3. 自转
    if (wireframeRef.current) {
      wireframeRef.current.rotation.y = -state.clock.getElapsedTime() * 0.1
      wireframeRef.current.rotation.x = state.clock.getElapsedTime() * 0.1
    }

    // 4. 音频参数同步
    if (audioSystem.isReady) {
      // ✅ 强制同步 BPM
      Tone.Transport.bpm.value = audioParams.current.bpm
      
      if (audioSystem.distortion) audioSystem.distortion.distortion = audioParams.current.distort
      if (audioSystem.reverb) audioSystem.reverb.wet.value = audioParams.current.reverbWet
    }
  })

  useGSAP(() => {
    if (!groupRef.current) return

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#content-container',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1, // 关键：必须开启 scrub
      },
    })

    // --- Stage 1: Awakening ---
    tl.to(groupRef.current.position, { z: 1.5, x: 0.5, duration: 1 })
      .fromTo(visualParams.current, 
        { color: '#ffffff', opacity: 0.5, distort: 0.3 }, // 起点：月光白
        { color: '#4ecdc4', opacity: 0.8, distort: 0.8, duration: 1 },
        '<'
      )
      .to(groupRef.current.rotation, { y: Math.PI, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 100, duration: 1 }, '<')

   // --- Stage 2: Chaos ---
    tl.to(groupRef.current.position, { x: -1.5, duration: 1 })
      .to(visualParams.current, { 
        distort: 1.0, // 👈 关键修复：从 1.5 降到 1.0。太高会出现尖刺(揪揪)。
        color: '#ff6b6b', 
        opacity: 0.95, 
        duration: 1 
      }, '<')
      .to(wireframeRef.current.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 180, distort: 0.8, duration: 1 }, '<')

    // --- Stage 3: Singularity ---
    tl.to(groupRef.current.position, { x: 0, z: 0, duration: 1 })
      .to(visualParams.current, { 
        distort: 0, 
        color: '#ffffff', // 终点：月光白
        opacity: 0.3, 
        duration: 1 
      }, '<')
      .to(wireframeRef.current.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 1 }, '<')
      .to(audioParams.current, { bpm: 30, distort: 0, reverbWet: 1, duration: 1 }, '<')

  }, [])

  return (
    <group ref={groupRef}>
      {/* 性能优化版几何体 */}
      {/* 🛠️ 修改 1：把精度从 [1, 5] 提高到 [1, 8] */}
      {/* 8 是一个性能和圆润度的平衡点，能消除边缘的尖刺感 */}
      <Icosahedron args={[1, 8]}>
        <MeshDistortMaterial
          ref={materialRef}
          transparent={true}
          opacity={0.5}
          color="#ffffff"
          
          // 🛠️ 关键步骤 3：玉石质感参数
          envMapIntensity={1.5} // 提高环境反射，让表面有光泽
          metalness={0.1}       // 一点点金属感，增加通透度
          roughness={0.7}       // 🌟 核心参数：0.7 是磨砂的黄金值。
                                // 太低会有光圈，太高会变平。0.7 刚刚好。
          
          clearcoat={0}         // 保持关闭，避免锐利反光
          
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

  // ✅ 关键修复：组件卸载时彻底清理状态
  useEffect(() => {
    return () => {
      // 停止并清理 Tone.js
      Tone.Transport.stop()
      Tone.Transport.cancel()
      if (audioSystem.loop) audioSystem.loop.dispose()
      
      // ⚠️ 极其重要：重置全局 Ready 状态
      // 这样下次组件加载时，initAudio 才会重新运行
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
        
        {/* 基础光 */}
        <ambientLight intensity={0.5} />
        {/* 🛠️ 关键步骤 2：添加一盏侧光，制造体积感 */}
        <directionalLight 
          position={[10, 10, 5]} // 从右上方打过来
          intensity={2.0} 
        />
        
        {/* 🛠️ 关键步骤 1：使用 city 预设，并开启最大模糊 */}
        {/* city 提供丰富的反射细节，blur={1} 把它们融化成磨砂质感 */}
        <Environment preset="city" blur={1} />
            
          <Model beatSignalRef={beatSignalRef} />
          {/* ✅ 后期处理特效层 */}
          {/* disableNormalPass 可以提升性能，multisampling={0} 关闭默认抗锯齿以获得更锐利的噪点 */}
          <EffectComposer disableNormalPass multisampling={0}>
            {/* luminanceThreshold: 0.9 意味着只有亮度超过 90% 的区域才会发光。
              这样可以保证只有核心最亮的地方发光，边缘保持清晰。
              intensity: 从 1.5 降到 0.5，温柔一点。
            */}
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
        {/* 内容区域保持不变 */}
        <section className="section left">
          <div>
            <h1 style={{fontSize: '4rem', margin: 0}}>RESTING</h1>
            <p style={{opacity: 0.6, fontFamily: 'monospace'}}>BPM: 60 // SYSTEM ONLINE</p>
          </div>
        </section>
        <section className="section right">
          <div>
            <h1 style={{fontSize: '4rem', margin: 0}}>ADRENALINE</h1>
            <p style={{opacity: 0.6, fontFamily: 'monospace'}}>BPM: 100 // PUPILS DILATED</p>
          </div>
        </section>
        <section className="section center">
          <div>
            <h1 style={{fontSize: '4rem', margin: 0}}>PANIC</h1>
            <p style={{opacity: 0.6, fontFamily: 'monospace'}}>BPM: 180 // SYSTEM FAILURE</p>
          </div>
        </section>
        <section className="section center">
          <div>
            <h1 style={{fontSize: '4rem', margin: 0}}>FLATLINE</h1>
            <p style={{opacity: 0.6, fontFamily: 'monospace'}}>BPM: 30 // RESET</p>
          </div>
        </section>
      </div>
    </>
  )
}
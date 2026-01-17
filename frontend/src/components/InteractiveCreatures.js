import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import '../styles/InteractiveCreatures.css';

// --- Helper Hook: Eye Tracker ---
const useEyeTracker = (eyeRef, mousePos, isPasswordFocused, containerRef, cx, cy, radius = 5) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // We check containerRef mainly to ensure the component is mounted/visible context
    if (!containerRef.current || !eyeRef.current) return;

    let targetX = mousePos.x;
    let targetY = mousePos.y;

    // Logic: If password focused, look away (up and away to shadow realm)
    if (isPasswordFocused) {
      targetX = -2000;
      targetY = -2000;
    }

    const rect = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = rect.left + rect.width / 2;
    const eyeCenterY = rect.top + rect.height / 2;

    const angle = Math.atan2(targetY - eyeCenterY, targetX - eyeCenterX);
    // Limit movement within radius
    const distance = Math.min(radius, Math.hypot(targetX - eyeCenterX, targetY - eyeCenterY) / 10); 

    setPosition({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    });
  }, [mousePos, isPasswordFocused, containerRef, cx, cy, radius]);

  return position;
};

// --- Sub-Component: Blinking Eye ---
const BlinkingEye = ({ cx, cy, r = 8, pupilR = 3, color = "white", pupilColor = "black", isBlinking, mousePos, isPasswordFocused, containerRef }) => {
   const eyeRef = useRef(null);
   // Pass all necessary state into the hook
   const pos = useEyeTracker(eyeRef, mousePos, isPasswordFocused, containerRef, cx, cy, r - pupilR);

   return (
     <g>
       <motion.g
          initial={false}
          animate={{ scaleY: isBlinking ? 0.1 : 1 }}
          transition={{ duration: 0.1 }}
          style={{ originX: `${cx}px`, originY: `${cy}px` }} // Pivot at center of eye
       >
          <circle ref={eyeRef} cx={cx} cy={cy} r={r} fill={color} />
          <motion.circle 
            cx={cx} 
            cy={cy} 
            r={pupilR} 
            fill={pupilColor}
            animate={ { x: pos.x, y: pos.y } }
            transition={{ type: "spring", stiffness: 150, damping: 15 }}
          />
       </motion.g>
     </g>
   );
};

// --- Sub-Component: Creature Hands (For Privacy Mode) ---
const CreatureHands = ({ cx, cy, color, isPasswordFocused, armOffset = 20 }) => {
  // Simple hands that pop up from bottom to cover eyes
  const handRadius = 8;
  const coveredY = cy; // Cover eyes
  const restingY = cy + 60; // Resting down

  return (
    <g>
      <motion.circle 
        cx={cx - armOffset} 
        cy={restingY} 
        r={handRadius} 
        fill={color} 
        animate={{ y: isPasswordFocused ? (coveredY - restingY) : 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
      />
      <motion.circle 
        cx={cx + armOffset} 
        cy={restingY} 
        r={handRadius} 
        fill={color}
        animate={{ y: isPasswordFocused ? (coveredY - restingY) : 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
      />
    </g>
  );
};

const InteractiveCreatures = ({ mousePos, isPasswordFocused, isTyping, focusedField }) => {
  const containerRef = useRef(null);

  // Blinking Logic
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const blinkLoop = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150); // Blink duration
      
      // Random interval between 2s and 6s
      const nextBlink = Math.random() * 4000 + 2000;
      setTimeout(blinkLoop, nextBlink);
    };
    
    // Start loop
    const timeoutId = setTimeout(blinkLoop, 3000);
    return () => clearTimeout(timeoutId);
  }, []);
  
  // Animation - specific for "Name" typing shock/bend
  const isNameActive = focusedField === 'name' && isTyping;

  const purpleBounce = {
    rotate: isNameActive ? -5 : 0, 
    y: isNameActive ? 5 : 0,
    transition: { type: "spring", stiffness: 60, damping: 12 }
  };

  const otherCreaturesLook = {
    // Slight lean towards purple guy
    x: isNameActive ? -3 : 0,
    transition: { duration: 0.5 }
  };

  // Mouth Animation Variants
  const mouthTransition = { duration: 0.3 };

  // Common props for eyes to clean up JSX
  const eyeProps = { isBlinking, mousePos, isPasswordFocused, containerRef };

  return (
    <div ref={containerRef} className="creatures-container">
      <svg viewBox="0 0 400 300" className="creatures-svg">
        
        {/* Background Ground Shadow */}
        <ellipse cx="200" cy="280" rx="180" ry="15" fill="#00000010" />

        {/* Purple Tall Guy - Back Left */}
        <motion.g 
          animate={purpleBounce} 
          style={{ originX: '130px', originY: '250px' }} // Pivot near bottom center
        >
          <rect x="90" y="50" width="80" height="200" rx="2" fill="#7c3aed" />
          <BlinkingEye cx={115} cy={80} r={6} pupilR={2.5} {...eyeProps} />
          <BlinkingEye cx={145} cy={80} r={6} pupilR={2.5} {...eyeProps} />
          <CreatureHands cx={130} cy={80} color="#7c3aed" isPasswordFocused={isPasswordFocused} armOffset={15} />
          <motion.path 
            // Name Active: Oval Shock Mouth ("O")
            // Happy Typing: Smile
            // Default: Flat
            d={
              isNameActive 
                ? "M 125 105 Q 120 115 125 125 Q 135 125 135 115 Q 135 105 125 105" // Oval-ish
                : isTyping 
                  ? "M 125 110 Q 130 120 135 110" 
                  : "M 125 110 Q 130 112 135 110"
            }
            fill={isNameActive ? "black" : "none"}
            stroke="black" 
            strokeWidth="2" 
            strokeLinecap="round"
            transition={mouthTransition}
          />
        </motion.g>

        {/* Black Medium Guy - Back Right (tucked closer) */}
        <motion.g animate={otherCreaturesLook}>
          <rect x="160" y="110" width="60" height="140" rx="2" fill="#1f2937" />
          <BlinkingEye cx={175} cy={135} r={6} pupilR={2.5} {...eyeProps} />
          <BlinkingEye cx={195} cy={135} r={6} pupilR={2.5} {...eyeProps} />
          <CreatureHands cx={185} cy={135} color="#1f2937" isPasswordFocused={isPasswordFocused} armOffset={12} />
          <motion.path
             d={isNameActive 
                ? "M 183 150 Q 185 152 187 150" // Small "oh"
                : isTyping 
                    ? "M 182 150 Q 185 155 188 150" 
                    : "M 182 150 Q 185 150 188 150"
             }
             stroke="white"
             fill="none"
             strokeWidth="1.5"
             strokeLinecap="round"
             opacity={isTyping ? 1 : 0} 
             transition={mouthTransition}
          />
        </motion.g>

        {/* Orange Blob - Front Left */}
        <motion.g animate={otherCreaturesLook}>
           <path d="M 50 250 A 60 60 0 0 1 170 250 L 50 250 Z" fill="#fb923c" />
           <BlinkingEye cx={80} cy={210} r={5} pupilR={2} {...eyeProps} /> 
           <BlinkingEye cx={120} cy={210} r={5} pupilR={2} {...eyeProps} />
           <CreatureHands cx={100} cy={210} color="#fb923c" isPasswordFocused={isPasswordFocused} armOffset={20} />
           <motion.path 
            d={isNameActive 
              ? "M 95 230 Q 100 245 105 230" // Shock/Talk vertical oval
              : isTyping 
                ? "M 90 225 Q 100 240 110 225" 
                : "M 90 225 Q 100 230 110 225"
            } 
            fill={isNameActive ? "black" : "none"}
            stroke="black" 
            strokeWidth="2" 
            strokeLinecap="round" 
            transition={mouthTransition}
          />
        </motion.g>

        {/* Yellow Finger Guy - Front Right */}
        <motion.g animate={otherCreaturesLook}>
          <path d="M 200 250 L 200 190 A 35 35 0 0 1 270 190 L 270 250 Z" fill="#facc15" />
          <BlinkingEye cx={225} cy={180} r={5} pupilR={2} {...eyeProps} />
          <BlinkingEye cx={255} cy={180} r={5} pupilR={2} {...eyeProps} />
          <CreatureHands cx={240} cy={180} color="#facc15" isPasswordFocused={isPasswordFocused} armOffset={15} />
          <motion.path 
            d={isNameActive
                ? "M 240 210 Q 245 220 250 210 Q 245 205 240 210" // Small shout
                : isTyping 
                    ? "M 235 210 Q 245 220 255 210" 
                    : "M 235 210 Q 245 210 255 210"
            } 
            fill={isNameActive ? "black" : "none" }
            stroke="black" 
            strokeWidth="2" 
            strokeLinecap="round" 
            transition={mouthTransition}
          />
        </motion.g>

      </svg>
    </div>
  );
};

export default InteractiveCreatures;

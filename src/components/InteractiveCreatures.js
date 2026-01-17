import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import '../styles/InteractiveCreatures.css';

const InteractiveCreatures = ({ mousePos, isPasswordFocused, isTyping, focusedField }) => {
  const containerRef = useRef(null);
  
  // Calculate eye position based on target (mouse or fixed point)
  const useEyeTracker = (eyeRef, cx, cy, radius = 5) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
      if (!containerRef.current || !eyeRef.current) return;

      let targetX = mousePos.x;
      let targetY = mousePos.y;

      // Logic: If password focused, look away (up and away to shadow realm)
      if (isPasswordFocused) {
        // Look far top-left
        targetX = -2000;
        targetY = -2000;
      }

      const rect = eyeRef.current.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      const angle = Math.atan2(targetY - eyeCenterY, targetX - eyeCenterX);
      const distance = Math.min(radius, Math.hypot(targetX - eyeCenterX, targetY - eyeCenterY) / 10); 

      setPosition({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance
      });
    }, [mousePos, isPasswordFocused, cx, cy, radius]);

    return position;
  };

  const Eye = ({ cx, cy, r = 8, pupilR = 3, color = "white", pupilColor = "black" }) => {
    const eyeRef = useRef(null);
    const pos = useEyeTracker(eyeRef, cx, cy, r - pupilR);

    return (
      <g>
        <circle ref={eyeRef} cx={cx} cy={cy} r={r} fill={color} />
        <motion.circle 
          cx={cx} 
          cy={cy} 
          r={pupilR} 
          fill={pupilColor}
          animate={ { x: pos.x, y: pos.y } }
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        />
      </g>
    );
  };
  
  // Animation - Disabled vertical shaking/dancing
  const getBounce = (delay) => ({
    y: 0
  });

  // Mouth Animation Variants
  const mouthTransition = { duration: 0.3 };

  return (
    <div ref={containerRef} className="creatures-container">
      <svg viewBox="0 0 400 300" className="creatures-svg">
        
        {/* Background Ground Shadow */}
        <ellipse cx="200" cy="280" rx="180" ry="15" fill="#00000010" />

        {/* Purple Tall Guy - Back Left */}
        <motion.g animate={getBounce(0)}>
          <rect x="90" y="50" width="80" height="200" rx="2" fill="#7c3aed" />
          <Eye cx="115" cy="80" r={6} pupilR={2.5} />
          <Eye cx="145" cy="80" r={6} pupilR={2.5} />
          <motion.path 
            // Happy: Open smile D shape-ish or deeper curve
            d={isTyping ? "M 125 110 Q 130 120 135 110" : "M 125 110 Q 130 112 135 110"}
            fill="none" 
            stroke="black" 
            strokeWidth="2" 
            strokeLinecap="round"
            transition={mouthTransition}
          />
        </motion.g>

        {/* Black Medium Guy - Back Right (tucked closer) */}
        <motion.g animate={getBounce(0.1)}>
          <rect x="160" y="110" width="60" height="140" rx="2" fill="#1f2937" />
          <Eye cx="175" cy="135" r={6} pupilR={2.5} />
          <Eye cx="195" cy="135" r={6} pupilR={2.5} />
          <motion.path
             // Simple small smile when happy
             d={isTyping ? "M 182 150 Q 185 155 188 150" : "M 182 150 Q 185 150 188 150"}
             stroke="white"
             fill="none"
             strokeWidth="1.5"
             strokeLinecap="round"
             opacity={isTyping ? 1 : 0} // Only show mouth when active/happy? Or kept subtle
             transition={mouthTransition}
          />
        </motion.g>

        {/* Orange Blob - Front Left */}
        <motion.g animate={getBounce(0.2)}>
           <path d="M 50 250 A 60 60 0 0 1 170 250 L 50 250 Z" fill="#fb923c" />
           <Eye cx="80" cy="210" r={5} pupilR={2} /> 
           <Eye cx="120" cy="210" r={5} pupilR={2} />
           <motion.path 
             // Happy: Big open smile
            d={isTyping ? "M 90 225 Q 100 240 110 225" : "M 90 225 Q 100 230 110 225"} 
            fill="none" 
            stroke="black" 
            strokeWidth="2" 
            strokeLinecap="round" 
            transition={mouthTransition}
          />
        </motion.g>

        {/* Yellow Finger Guy - Front Right */}
        <motion.g animate={getBounce(0.05)}>
          <path d="M 200 250 L 200 190 A 35 35 0 0 1 270 190 L 270 250 Z" fill="#facc15" />
          <Eye cx="225" cy="180" r={5} pupilR={2} />
          <Eye cx="255" cy="180" r={5} pupilR={2} />
          <motion.path 
             // Happy: Curve vs Line
            d={isTyping ? "M 235 210 Q 245 220 255 210" : "M 235 210 Q 245 210 255 210"} 
            fill="none" 
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

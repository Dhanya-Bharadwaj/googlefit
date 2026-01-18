import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/IntroAnimation.css';

const IntroAnimation = ({ onComplete }) => {
    const [step, setStep] = useState(0); 
    const text = 'FITNESS TRACKER AT ELOCITY';
    
    const fullText = useMemo(() => text.split(''), [text]);
    const lettersToCatch = useMemo(() => text.replace(/\s/g, '').split(''), [text]);
  
    // Generate sequence for catching (Target X positions)
    // Distributed across the screen width roughly, with some randomness
    const [catchPositions] = useState(() => 
      lettersToCatch.map(() => (Math.random() * 500) - 250) 
    );
    
    // Calculate Timing for perfect sync
    const dropDuration = 0.8; // Quicker drop
    const stagger = 0.4; // Time between letters
    const totalCatchTime = (lettersToCatch.length * stagger) + dropDuration + 1;

    useEffect(() => {
      const sequence = async () => {
        // Step 0: Fall IN (1s)
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 1: Look (1.5s)
        setStep(1);
        await new Promise(r => setTimeout(r, 1500)); 
  
        // Step 2: Basket (1s)
        setStep(2);
        await new Promise(r => setTimeout(r, 1000));
  
        // Step 3: Catch (Dynamic)
        setStep(3);
        await new Promise(r => setTimeout(r, totalCatchTime * 1000));
  
        // Step 4: Arrange (Go to each letter)
        setStep(4);
        const arrangeDuration = fullText.length * 100 + 1000; 
        await new Promise(r => setTimeout(r, arrangeDuration));
  
        // Step 5: Finish
        setStep(5);
        await new Promise(r => setTimeout(r, 2000));
  
        onComplete();
      };
      sequence();
    }, [onComplete, lettersToCatch.length, fullText.length, totalCatchTime]);

    return (
        <div className="intro-container">
             <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Philosopher:ital,wght@0,700;1,700&display=swap');
                    .final-char, .falling-letter {
                        font-family: 'Philosopher', sans-serif !important;
                        font-weight: 700;
                        font-style: italic;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                `}
            </style>

            {/* Final Text Display */}
            <div className="final-text-container">
                {fullText.map((char, i) => {
                    // Check if this char belongs to 'ELOCITY'
                    // 'FITNESS TRACKER AT ELOCITY'
                    // Index of E is 19
                    const isGreen = i >= 19; 

                    return (
                        <motion.span 
                            key={i}
                            className={`final-char ${isGreen ? 'green-text' : ''}`}
                            initial={{ opacity: 0, y: 50, scale: 0.5 }}
                            animate={step >= 4 ? { 
                                opacity: 1, 
                                y: 0, 
                                scale: [1, 1.2, 1],
                                textShadow: isGreen ? "0px 0px 8px rgba(34, 197, 94, 0.8)" : "none"
                            } : {}}
                            transition={{ 
                                delay: step === 4 ? i * 0.1 : 0, 
                                type: 'spring' 
                            }}
                        >
                            {char === ' ' ? '\u00A0' : char}
                        </motion.span>
                    );
                })}
            </div>

            {/* Falling Letters */}
            {step === 3 && lettersToCatch.map((char, i) => (
                <FallingLetter 
                    key={i} 
                    char={char} 
                    targetX={catchPositions[i]} 
                    delay={i * stagger} 
                    duration={dropDuration}
                />
            ))}

            {/* Creature */}
            <CreatureWrapper 
                step={step} 
                catchPositions={catchPositions} 
                totalLetters={fullText.length}
                stagger={stagger}
                dropDuration={dropDuration} 
                totalCatchTime={totalCatchTime}
            />
        </div>
    )
}

const FallingLetter = ({ char, targetX, delay, duration }) => {
    return (
        <motion.div
            className="falling-letter"
            initial={{ x: targetX, y: -400, opacity: 0, scale: 0 }}
            animate={{ 
                y: 160, // Deep into basket
                scale: 0.8,
                opacity: 1
            }} 
            transition={{ 
                duration: duration, 
                delay: delay,
                ease: "easeIn"
            }}
            style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                marginLeft: '-1rem' 
            }}
        >
            <motion.div
                animate={{ opacity: 0 }}
                transition={{ delay: delay + duration, duration: 0.1 }}
            >
                {char}
            </motion.div>
        </motion.div>
    );
};

const CreatureWrapper = ({ step, catchPositions, totalLetters, stagger, dropDuration, totalCatchTime }) => {
    
    // Construct Keyframes for precision catching
    // The creature needs to be at catchPositions[i] at time (i * stagger) + dropDuration
    
    const xKeyframes = [0];
    const times = [0];

    catchPositions.forEach((pos, i) => {
        const catchTime = (i * stagger) + dropDuration;
        const normalizedTime = catchTime / totalCatchTime;
        
        // Add a "approach" point? No, just linear to the catch point is fine for now
        // But we want to hold there for a split second?
        
        xKeyframes.push(pos);
        times.push(normalizedTime);
    });

    // Return to center at end
    xKeyframes.push(0);
    times.push(1);

    const xArrange = [-400, 400];

    return (
        <motion.div
            className="creature-wrapper"
            initial={{ y: -600, x: 0 }}
            animate={{
                // Step 5: Text is at 40% top, Center is 50%. Difference is ~10vh. 
                // We move up (-100px) to aligning with the text row.
                y: step === 5 ? -50 : 150, 
                // Step 5: Move to left of text. Text width approx 800px. Start is ~ -400. 
                // We want to be immediately beside F. Creature width is 40.
                x: step === 3 ? xKeyframes : (step === 4 ? xArrange : (step === 5 ? -425 : 0)),
            }}
            transition={
                step === 0 ? { type: "spring", bounce: 0.4, duration: 1 } :
                step === 3 ? { duration: totalCatchTime, times: times, ease: "linear" } : 
                step === 4 ? { duration: totalLetters * 0.1 + 1, ease: "linear" } : 
                step === 5 ? { duration: 1.5, type: "spring", bounce: 0.2 } :
                { duration: 0.5 }
            }
        >
             <CreatureBody step={step} isCatching={step === 3} catchDuration={totalCatchTime} />
        </motion.div>
    )
}

const CreatureBody = ({ step, isCatching, catchDuration }) => {
    return (
        <React.Fragment>
             {/* Basket */}
             {step >= 2 && (
                 <motion.div 
                    className="basket"
                    initial={{ y: -500, opacity: 0 }}
                    animate={{ 
                        y: -60, 
                        opacity: 1, 
                        scale: step === 5 ? 0 : 1,
                        // Shake when catching
                        rotate: isCatching ? [0, -5, 5, 0] : 0
                    }} 
                    transition={{ 
                        type: "spring", bounce: 0.4,
                        rotate: { repeat: isCatching ? Infinity : 0, duration: 0.2 }
                    }}
                 />
             )}
             
             {/* Main Body */}
             <motion.div
                className="creature-main"
                animate={
                    step === 5 
                    ? { 
                        width: 40, 
                        height: 90, 
                        borderRadius: "20px", 
                        backgroundColor: "#facc15",
                        rotate: 15, // Lean right against F
                        x: 0
                      } 
                    : step === 4
                    ? { width: 80, height: 100, borderRadius: "40px", backgroundColor: "#fb923c", rotate: 0 } 
                    : step === 3
                    ? { width: 110, height: 115, borderRadius: "48%", backgroundColor: "#fb923c", rotate: 0 } 
                    : { width: 140, height: 120, borderRadius: "50%", backgroundColor: "#fb923c", rotate: 0 } 
                }
                transition={{ 
                    duration: step === 3 ? catchDuration : (step === 4 ? 4 : 1), 
                    ease: "easeInOut" 
                }}
             >
                 {/* Arms holding basket */}
                 {step >= 2 && step < 5 && (
                     <>
                        <motion.div className="arm left" 
                            animate={{ rotate: [30, 45, 30] }} 
                            transition={{ repeat: Infinity, duration: 0.5 }} 
                        />
                        <motion.div className="arm right" 
                             animate={{ rotate: [-30, -45, -30] }} 
                             transition={{ repeat: Infinity, duration: 0.5 }}
                        />
                     </>
                 )}

                 <motion.div 
                    className="face"
                    animate={step === 1 ? { x: [-5, 5, -5, 0] } : {}} // Look left/right
                    transition={{ duration: 1.5 }}
                 >
                     <div className="eye left" />
                     <div className="eye right" />
                     <motion.div 
                        className="mouth" 
                        animate={step === 5 ? { height: 5, width: 10, borderRadius: 0 } : {}} 
                     />
                 </motion.div>
             </motion.div>
        </React.Fragment>
    )
}

export default IntroAnimation;

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import '../styles/IntroAnimation.css';

const IntroAnimation = ({ onComplete }) => {
    const [step, setStep] = useState(0); 
    const text = 'FITNESS TRACKER AT ELOCITY';
    
    const fullText = useMemo(() => text.split(''), [text]);
    
    // Calculate Timing for perfect sync
    useEffect(() => {
      const sequence = async () => {
        // Step 0: Fall IN (1s)
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 1: Look (1.5s)
        setStep(1);
        await new Promise(r => setTimeout(r, 1500)); 
  
        // Step 2: Show Basket already full (1s)
        setStep(2);
        await new Promise(r => setTimeout(r, 1000));
  
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
    }, [onComplete, fullText.length]);

    return (
        <div className="intro-container">
             <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Philosopher:ital,wght@0,700;1,700&display=swap');
                    .final-char, .falling-letter, .basket-letter {
                        font-family: 'Philosopher', sans-serif !important;
                        font-weight: 700;
                        font-style: italic;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                    .basket-letter {
                        position: absolute;
                        font-size: 1.2rem;
                        color: #4b5563;
                        pointer-events: none;
                    }
                `}
            </style>

            {/* Final Text Display */}
            <div className="final-text-container">
                {(() => {
                    let globalIndex = 0;
                    return text.split(' ').map((word, wIndex) => {
                        const wordComponent = (
                            <div key={wIndex} className="word-wrapper">
                                {word.split('').map((char) => {
                                    const i = globalIndex;
                                    globalIndex++;
                                    // Check if this char belongs to 'ELOCITY'
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
                                            {char}
                                        </motion.span>
                                    );
                                })}
                            </div>
                        );
                        // Increment for the space
                        globalIndex++;
                        return wordComponent;
                    });
                })()}
            </div>

            {/* Creature */}
            <CreatureWrapper 
                step={step} 
                totalLetters={fullText.length}
            />

            {/* Skip Button */}
            <motion.button
                onClick={onComplete}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.9)" }}
                whileTap={{ scale: 0.95 }}
                style={{
                    position: 'absolute',
                    bottom: '40px',
                    right: '40px',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(8px)',
                    padding: '10px 20px',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: "'Philosopher', sans-serif",
                    fontWeight: '700',
                    color: '#374151',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
                    zIndex: 1000,
                    textTransform: 'uppercase',
                    fontSize: '0.8rem',
                    letterSpacing: '1px'
                }}
            >
                Skip 
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M5 3l14 9-14 9V3z" />
                </svg>
            </motion.button>
        </div>
    )
}

const CreatureWrapper = ({ step, totalLetters }) => {
    const xArrange = [-400, 400];

    return (
        <motion.div
            className="creature-wrapper"
            initial={{ y: -600, x: 0 }}
            animate={{
                y: step === 5 ? -50 : 150, 
                x: step === 4 ? xArrange : (step === 5 ? -425 : 0),
            }}
            transition={
                step === 0 ? { type: "spring", bounce: 0.4, duration: 1 } :
                step === 4 ? { duration: totalLetters * 0.1 + 1, ease: "linear" } : 
                step === 5 ? { duration: 1.5, type: "spring", bounce: 0.2 } :
                { duration: 0.5 }
            }
        >
             <CreatureBody step={step} />
        </motion.div>
    )
}

const CreatureBody = ({ step }) => {
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
                    }} 
                    transition={{ type: "spring", bounce: 0.4 }}
                 >
                    {/* Letters already in basket */}
                    {step < 4 && (
                        <>
                            <div className="basket-letter" style={{ top: 10, left: 15, transform: 'rotate(-15deg)' }}>F</div>
                            <div className="basket-letter" style={{ top: 5, left: 35, transform: 'rotate(10deg)' }}>I</div>
                            <div className="basket-letter" style={{ top: 15, left: 50, transform: 'rotate(-5deg)' }}>T</div>
                            <div className="basket-letter" style={{ top: 8, left: 25, transform: 'rotate(20deg)' }}>N</div>
                        </>
                    )}
                 </motion.div>
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
                    : { width: 140, height: 120, borderRadius: "50%", backgroundColor: "#fb923c", rotate: 0 } 
                }
                transition={{ 
                    duration: step === 4 ? 4 : 1, 
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

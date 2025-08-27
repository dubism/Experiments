// Dark mode detection
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark');
        }
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            if (event.matches) {
                document.body.classList.add('dark');
            } else {
                document.body.classList.remove('dark');
            }
        });

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const scoreElement = document.getElementById('score');
        const redPointsElement = document.getElementById('redPoints');
        const gameOverElement = document.getElementById('gameOver');
        const finalScoreElement = document.getElementById('finalScore');

        const hardnessSlider = document.getElementById('hardness');
        const hardnessLabel = document.getElementById('hardnessLabel');
        const gradientSpeedSlider = document.getElementById('gradientSpeed');
        const gradientSpeedLabel = document.getElementById('gradientSpeedLabel');

        // Gradient speed - now linked to game progression (no manual control)
        let gradientSpeed = 3; // Start at "calm" (level 3)

        // SINGLE SOURCE OF TRUTH - All gradient colors defined here
        const GRADIENT_COLOR_SCHEMES = [
            { top: '#545453', bottom: '#757B7E', name: 'Cool Gray' },     // Section 1
            { top: '#5D534B', bottom: '#7D7263', name: 'Warm Taupe' },    // Section 2  
            { top: '#635041', bottom: '#86755B', name: 'Medium Brown' },   // Section 3
            { top: '#6E4537', bottom: '#8D5A48', name: 'Rich Brown' },    // Section 4
            { top: '#4D2E26', bottom: '#6A3C33', name: 'Dark Brown' },    // Section 5 - UPDATED FROM IMAGE
            { top: '#24000E', bottom: '#4D2E26', name: 'Deep Burgundy' }  // Section 6 - DARKEST
        ];

        // Gradient speed levels with labels - EXTREME SPEED RANGE
        const gradientSpeedLevels = {
            1: "Glacial", 2: "Slow", 3: "Calm", 4: "Steady", 5: "Moderate",
            6: "Active", 7: "Brisk", 8: "Fast", 9: "Quick", 10: "Rapid",
            11: "Blazing", 12: "Lightning", 13: "Turbo", 14: "Insane", 15: "Ludicrous",
            16: "Warp", 17: "Hyperspeed", 18: "Godmode", 19: "Quantum", 20: "RIDICULOUS"
        };





        // Control variables
        let bounciness = 50; // Default level as 50%
        let attractionRadius = 80; // Default attraction field size (changed to Gentle default)
        
        // FIXED VALUES (no sliders)
        let growthRate = 10; // Growth rate of string ball - FIXED at 10%
        let springWeight = 0; // Weight/drag effect - FIXED at 0% (no weight)
        
        // ADJUSTABLE VALUES
        let springLength = 60; // Spring length (20-150%) - has slider
        let springStiffness = 95; // Spring stiffness (0-100%) - has slider
        let orbitalSpringiness = 15; // Orbital springiness (5-100%) - has slider
        let reachingDistance = 60; // FIXED at 60% reaching distance
        
        // Two-stage interpolation parameters (both driven by distance to closest dot)
        let angularInterpolation = 0;  // Stage 1: How much the spring rotates toward dot (0=no rotation, 1=full rotation)
        let reachingInterpolation = 0; // Stage 2: How much it extends from rotated position toward dot (0=at rotated position, 1=at dot)
        
        // Smooth interpolation decay after dot collection
        let reachingDecay = 0; // 0 = no decay, higher = decaying back to spring position
        let targetingCooldown = 0; // Cooldown to prevent immediate re-targeting after collect/miss
        
        // Emotional hardness levels with attraction field sizes
        const hardnessLevels = {
            1: { label: "😌 Gentle", color: "#2ecc71", field: 80 },
            2: { label: "🎯 Focused", color: "#3498db", field: 50 },
            3: { label: "🔥 Intense", color: "#f39c12", field: 30 },
            4: { label: "⚡ Brutal", color: "#e74c3c", field: 20 },
            5: { label: "💀 Nightmare", color: "#8e44ad", field: 10 }
        };



        // Hardness level control
        hardnessSlider.addEventListener('input', (e) => {
            const level = parseInt(e.target.value);
            const hardness = hardnessLevels[level];
            attractionRadius = hardness.field;
            hardnessLabel.textContent = hardness.label;
            hardnessLabel.style.color = hardness.color;
            
            // Animate the label change
            hardnessLabel.style.transform = 'scale(1.2)';
            setTimeout(() => {
                hardnessLabel.style.transform = 'scale(1)';
            }, 200);
        });





        // Initialize default hardness level (1 = Gentle)
        const defaultLevel = hardnessLevels[1];
        attractionRadius = defaultLevel.field;
        hardnessLabel.style.color = defaultLevel.color;

        // Game variables
        let gameRunning = true;
        let gamePaused = false;
        let gameOverFalling = false;
        let score = 0;
        let redPoints = 0;
        let gameSpeed = 3;
        let gameTime = 0; // Track total game time for various effects
        
        // Obstacles
        let obstacles = [];
        let obstacleTimer = 0;
        
        // Collision effects - BOUNCE ONLY!
        let currentCollisionEffect = 1; // Always use bounce (1)
        let ballSmashed = { active: false, slideVx: 0, friction: 0.95, flatness: 1.0 };
        let ballBouncing = { active: false, vx: 0, vy: 0, bounces: 0, maxBounces: 8 };
        let ballMelting = { active: false, droplets: [], viscosity: 0.8 };
        


        // Pause functionality
        const pauseBtn = document.getElementById('pauseBtn');

        function togglePause() {
            if (!gameRunning) return; // Don't pause if game over
            
            gamePaused = !gamePaused;
            
            

// === Overlay visibility tied to pause state ===
try {
  const body = document.body;
  const overlayVisible = !!(body && body.classList.contains('paused'));
  if (gamePaused && !overlayVisible) {
    body.classList.add('paused');
  } else if (!gamePaused && overlayVisible) {
    body.classList.remove('paused');
  } else if (!gamePaused) {
    body.classList.remove('paused');
  }
  if (pauseBtn) {
    pauseBtn.textContent = gamePaused ? '▶️ RESUME' : '⏸';
  }
} catch(_) {}

if (gamePaused) {
                pauseBtn.textContent = '▶️ RESUME';
                pauseBtn.classList.add('paused');
            } else {
                pauseBtn.textContent = '⏸️ PAUSE';
                pauseBtn.classList.remove('paused');
            }
        }

        pauseBtn.addEventListener('click', togglePause);

        // Ball properties
        const ball = {
            x: 80,
            y: 220,
            radius: 20,
            velocity: 0,
            gravity: 0.4,
            jumpPower: -10.4,
            bouncing: false,
            color: '#51F093',
            scaleX: 1,  // Horizontal scale
            scaleY: 1,  // Vertical scale
            impactTimer: 0 // For impact squash effect
        };

        // String anchor point - dangles from ball like on a string
        const stringAnchor = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            offsetX: 35,    // Bottom-right offset from ball
            offsetY: 45,    // Bottom-right offset from ball
            swayX: 0,       // Swaying motion
            swaySpeed: 0.02, // How fast it sways
            swayTime: 0     // Time counter for sway
        };

        // Growing string ball - starts empty, grows by absorbing orbiting dots
        const stringBall = {
            exists: false,  // Initially invisible/empty
            x: 0,
            y: 0,
            radius: 2,      // Starting radius when first created
            baseRadius: 2,  // Base radius
            absorptionCount: 0, // How many dots have been absorbed
            
            // Visual effects
            glowIntensity: 0,     // For absorption glow effect
            growthScale: 1,       // For growth pulse animation
            absorptionFlash: 0,   // Flash effect on absorption
            
            // Physics
            vx: 0,
            vy: 0,
            falling: false
        };

        // Ground
        const ground = {
            y: 260,
            height: 40
        };

        // Collectible dots
        let dots = [];
        let dotTimer = 0;

        // Responsive canvas
        function resizeCanvas() {
            const container = canvas.parentElement;
            const maxWidth = Math.min(1200, window.innerWidth - 40);
            canvas.style.width = maxWidth + 'px';
            canvas.style.height = (maxWidth * 0.25) + 'px'; // 300/1200 = 0.25 for new height ratio
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Input handling
        function jump() {
            if (gameRunning) {
                ball.velocity = ball.jumpPower; // Always allow jump (space gives upward impulse)
                ball.bouncing = true;
            }
        }

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (!gameRunning) {
                    restartGame();
                } else if (!gamePaused) {
                    jump();
                }
            } else if (e.code === 'KeyP') {
                e.preventDefault();
                togglePause();
            } else if (e.code === 'KeyC') {
                e.preventDefault();
                cycleCollisionEffect();
            }
        });

        // Touch controls
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!gameRunning) {
                restartGame();
            } else {
                jump();
            }
        });

        canvas.addEventListener('click', (e) => {
            if (!gameRunning) {
                restartGame();
            } else {
                jump();
            }
        });

        // Dot creation
        function createDot() {
            const size = Math.min(Math.random() * 8 + 4, 8); // Random size between 4-12, but capped at 8px
            // Enhanced speed based on time - gets progressively faster (20% faster acceleration)
            const timeSpeedBonus = Math.min(gameTime * 0.00012, 2.4); // Up to +2.4 speed, 20% faster rate
            const currentDotSpeed = gameSpeed + timeSpeedBonus;
            
            dots.push({
                x: canvas.width,
                y: Math.random() * 200 + 30, // Bigger range: 30-230 (was 35-170)
                radius: size,
                points: 1, // One point per dot
                collected: false,
                missed: false,
                vx: -currentDotSpeed, // Enhanced speed with time bonus
                vy: 0, // Initial vertical velocity
                orbiting: false, // Whether dot is orbiting the ball
                attracted: false, // Whether dot is being attracted
                stringClustering: false, // Whether dot is moving to string cluster
                orbitTime: 0, // How long dot has been orbiting
                
                // Orbit parameters (set when attraction starts)
                orbitCenterX: 0,
                orbitCenterY: 0,
                orbitCenterVelX: 0, // Velocity for spring physics
                orbitCenterVelY: 0, // Velocity for spring physics
                orbitA: 0, // Semi-major axis
                orbitB: 0, // Semi-minor axis
                orbitAngle: 0, // Rotation angle of ellipse
                orbitPhase: 0, // Current position on ellipse (0-2π)
                orbitSpeed: 0, // How fast to move around ellipse
                lerpTime: 0, // Time parameter for easing (0-1)
                lerpFactor: 0, // 0=linear motion, 1=full orbital motion (eased)
                zDepth: 0, // For 3D simulation (positive = in front)
                
                // String cluster parameters
                clusterOffset: { x: 0, y: 0 } // Random offset within cluster
            });
        }
        
        // Obstacle creation
        function createObstacle() {
            // Random obstacle types
            const types = ['spike', 'block', 'saw'];
            const type = types[Math.floor(Math.random() * types.length)];
            
            // Calculate obstacle speed - SAME progression as dots!
            const timeSpeedBonus = Math.min(gameTime * 0.00012, 2.4); // Same as dots
            const currentObstacleSpeed = gameSpeed + timeSpeedBonus;
            
            let obstacle;
            
            if (type === 'spike') {
                obstacle = {
                    type: 'spike',
                    x: canvas.width,
                    y: ground.y - 25, // On ground
                    width: 15,
                    height: 25,
                    vx: -(currentObstacleSpeed + 1), // Now uses time-based speed!
                    rotation: 0
                };
            } else if (type === 'block') {
                obstacle = {
                    type: 'block',
                    x: canvas.width,
                    y: ground.y - 30,
                    width: 25,
                    height: 30,
                    vx: -(currentObstacleSpeed + 1), // Now uses time-based speed!
                    rotation: 0
                };
            } else { // saw
                obstacle = {
                    type: 'saw',
                    x: canvas.width,
                    y: Math.random() * 180 + 40, // Floating in air
                    radius: 20,
                    vx: -(currentObstacleSpeed + 2), // Now uses time-based speed!
                    rotation: 0,
                    rotationSpeed: 0.2
                };
            }
            
            obstacles.push(obstacle);
        }

        // Game physics
        function updateBall() {
            ball.velocity += ball.gravity;
            ball.y += ball.velocity;

            // Calculate bounciness factor (0-1 range)
            const bouncinessFactor = bounciness / 100;
            
            // Squash-Stretch Animation Logic (reduced to 50% of original)
            const speed = Math.abs(ball.velocity);
            
            // Impact timer countdown
            if (ball.impactTimer > 0) {
                ball.impactTimer--;
            }

            // STRETCH: When moving fast (high velocity) - only if bounciness > 0
            if (speed > 2 && ball.impactTimer === 0 && bouncinessFactor > 0) {
                // Fast movement = tall and narrow (stretch) - reduced by 50%
                const stretchAmount = Math.min(speed * 0.04, 0.2) * bouncinessFactor; // Reduced from 0.08 to 0.04, cap from 0.4 to 0.2
                ball.scaleX = 1 - stretchAmount * 0.5; // Narrower
                ball.scaleY = 1 + stretchAmount; // Taller
            } 
            // NORMAL: Slow movement or resting - always return to perfect circle when standing
            else if (ball.impactTimer === 0) {
                // Gradually return to normal shape
                ball.scaleX += (1 - ball.scaleX) * 0.15;
                ball.scaleY += (1 - ball.scaleY) * 0.15;
                
                // Force perfect circle when nearly still and on ground
                if (speed < 0.1 && ball.y >= ground.y - ball.radius - 1) {
                    ball.scaleX = 1;
                    ball.scaleY = 1;
                }
            }

            // Ground collision with bounce effect
            if (ball.y > ground.y - ball.radius) {
                ball.y = ground.y - ball.radius;
                
                // SQUASH: Impact effect (wide and short) - only if bounciness > 0, reduced by 50%
                if (bouncinessFactor > 0) {
                    ball.scaleX = 1 + (0.2 * bouncinessFactor); // Reduced from 0.4 to 0.2 extra width
                    ball.scaleY = 1 - (0.15 * bouncinessFactor); // Reduced from 0.3 to 0.15 less height
                    ball.impactTimer = Math.floor(8 * bouncinessFactor); // Scale impact timer with bounciness
                }
                
                // Bounce physics controlled by slider
                const bounceThreshold = 0.2 * bouncinessFactor; // Scale threshold with bounciness
                if (Math.abs(ball.velocity) > bounceThreshold && bouncinessFactor > 0) {
                    // Bounce strength scales with bounciness (0% = no bounce, 80% = current, 100% = more)
                    const bounceStrength = 0.3 + (0.5 * bouncinessFactor); // 0.3 to 0.8 range
                    ball.velocity = ball.velocity * -bounceStrength;
                } else {
                    ball.velocity = 0; // Stop bouncing
                    ball.bouncing = false;
                }
            }
        }

        function updateDots() {
            dotTimer++;
            obstacleTimer++;
            gameTime++; // Increment game time for various effects
            
            // Create new dots - start slower, gradually increase frequency
            const baseInterval = 240; // Start slower (was 160)
            const speedIncrease = Math.floor(score / 100) * 10; // Gradual increase
            const currentInterval = Math.max(50, baseInterval - speedIncrease); // Min 50 frames
            
            if (dotTimer > currentInterval) {
                createDot();
                dotTimer = 0;
            }
            
            // Create obstacles occasionally - gets more frequent over time
            const obstacleBaseInterval = 600; // 10 seconds at 60fps
            const obstacleSpeedIncrease = Math.floor(gameTime / 3600) * 60; // More frequent every minute
            const currentObstacleInterval = Math.max(300, obstacleBaseInterval - obstacleSpeedIncrease);
            
            if (obstacleTimer > currentObstacleInterval) {
                createObstacle();
                obstacleTimer = 0;
            }

            // Update obstacles
            for (let i = obstacles.length - 1; i >= 0; i--) {
                const obstacle = obstacles[i];
                
                // Update position
                obstacle.x += obstacle.vx;
                
                // Update rotation for saws
                if (obstacle.type === 'saw') {
                    obstacle.rotation += obstacle.rotationSpeed;
                }
                
                // REALISTIC collision detection with ball - any contact counts!
                let collision = false;
                if (obstacle.type === 'saw') {
                    // Realistic circular collision for saws
                    const dx = ball.x - obstacle.x;
                    const dy = ball.y - obstacle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    collision = distance < ball.radius + obstacle.radius; // Full contact detection
                } else if (obstacle.type === 'spike') {
                    // Realistic triangular collision for spikes
                    const tipX = obstacle.x + obstacle.width / 2;
                    const tipY = obstacle.y;
                    const baseY = obstacle.y + obstacle.height;
                    
                    // Check collision with full ball area
                    if (ball.y + ball.radius > tipY && ball.y - ball.radius < baseY) {
                        const ballToTipX = Math.abs(ball.x - tipX);
                        const ballY = ball.y + ball.radius; // Bottom of ball
                        const spikeWidthAtBallY = (ballY - tipY) / obstacle.height * obstacle.width;
                        collision = ballToTipX < spikeWidthAtBallY / 2 && ballY > tipY;
                    }
                } else { // block
                    // Realistic rectangle collision for blocks - full contact
                    collision = ball.x + ball.radius > obstacle.x &&
                              ball.x - ball.radius < obstacle.x + obstacle.width &&
                              ball.y + ball.radius > obstacle.y &&
                              ball.y - ball.radius < obstacle.y + obstacle.height;
                }
                
                if (collision) {
                    // Apply selected collision effect
                    applyCollisionEffect(ball.x, ball.y);
                    
                    setTimeout(() => {
                        gameOver();
                    }, 300);
                    return;
                }
                
                // Remove off-screen obstacles
                if (obstacle.x + (obstacle.width || obstacle.radius * 2) < 0) {
                    obstacles.splice(i, 1);
                }
            }

            // Update each dot with simple linear movement
            for (let i = dots.length - 1; i >= 0; i--) {
                const dot = dots[i];
                
                // Calculate distance to ball
                const dx = ball.x - dot.x;
                const dy = ball.y - dot.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Use the attraction field size for collection
                const collectRadius = attractionRadius; // Use challenge level as collection radius
                
                // Award points when close enough and start moving to string ball
                // IGNORE MISSED (RED) DOTS COMPLETELY!
                if (distance < collectRadius && !dot.collected && !dot.missed) {
                    dot.collected = true;
                    dot.movingToString = true; // Start moving to string ball
                    score += dot.points;
                    scoreElement.textContent = score;
                    
                    // Set cooldown to prevent immediate re-targeting (60 frames = ~1 second)
                    targetingCooldown = 60;
                    

                }
                
                if (dot.movingToString) {
                    // SIMPLE: Move directly toward string anchor, then get absorbed
                    const targetX = stringAnchor.x;
                    const targetY = stringAnchor.y;
                    
                    // Calculate distance to anchor
                    const distanceToAnchor = Math.sqrt(
                        (targetX - dot.x) * (targetX - dot.x) + 
                        (targetY - dot.y) * (targetY - dot.y)
                    );
                    
                    // Absorb when close enough to anchor (~12px)
                    if (distanceToAnchor < 12) {
                        // CREATE/GROW STRING BALL
                        if (!stringBall.exists) {
                            // First absorption - create the string ball
                            stringBall.exists = true;
                            stringBall.x = stringAnchor.x;
                            stringBall.y = stringAnchor.y;
                            stringBall.radius = stringBall.baseRadius; // Start at 2px
                            stringBall.absorptionCount = 1;
                            stringBall.falling = false; // CRITICAL: Ensure it's connected, not falling
                        } else {
                            // Subsequent absorptions - grow the ball
                            stringBall.absorptionCount++;
                            const growthAmount = (growthRate / 100) * 1.0; // 0.1px per absorption
                            stringBall.radius = Math.min(25, stringBall.baseRadius + (stringBall.absorptionCount - 1) * growthAmount);
                        }
                        
                        // ✨ CAPTURE HIGHLIGHT - Bright circle flash!
                        stringBall.captureHighlight = 1.0; // Full intensity
                        stringBall.captureTimer = 30; // Fade over 30 frames (~0.5 seconds)
                        
                        // SMOOTH TRANSITION: Don't reset interpolation immediately, let it decay naturally
                        // This allows the string ball to smoothly return to anchor instead of snapping
                        
                        // Remove absorbed dot immediately
                        dots.splice(i, 1);
                        continue;
                    }
                    
                    // Move toward anchor quickly and directly
                    const moveSpeed = 0.15;
                    dot.x += (targetX - dot.x) * moveSpeed;
                    dot.y += (targetY - dot.y) * moveSpeed;
                } else {
                    // SIMPLE LINEAR MOVEMENT ONLY
                    dot.x += dot.vx;
                    dot.y += dot.vy;
                }
                
                // Check if dot is missed (passed the ball without being collected)
                if (!dot.collected && !dot.missed && dot.x < ball.x - ball.radius) {
                    dot.missed = true;
                    
                    // SMOOTH TRANSITION: Don't reset interpolation immediately, let it decay naturally
                    // This prevents jarring snaps when dots become missed
                    
                    // Set cooldown to prevent immediate re-targeting (60 frames = ~1 second)
                    targetingCooldown = 60;
                    
                    // Count misses and check for game over
                    redPoints++;
                    redPointsElement.textContent = redPoints;
                    
                    // Animate red points counter
                    const redPointsContainer = redPointsElement.parentElement;
                    redPointsContainer.classList.add('animate');
                    setTimeout(() => {
                        redPointsContainer.classList.remove('animate');
                    }, 600);
                    
                    // Check for game over
                    if (redPoints >= 3) {
                        gameOver();
                        return;
                    }
                }
                
                // Remove off-screen dots
                if (dot.x + dot.radius < 0) {
                    dots.splice(i, 1);
                }
            }
        }

        // Dot collection detection
        function checkCollections() {
            for (let i = dots.length - 1; i >= 0; i--) {
                const dot = dots[i];
                if (!dot.collected) {
                    const distance = Math.sqrt(
                        Math.pow(ball.x - dot.x, 2) + 
                        Math.pow(ball.y - dot.y, 2)
                    );
                    
                    if (distance < ball.radius + dot.radius) {
                        dot.collected = true;
                        score += dot.points;
                        scoreElement.textContent = score;
                        dots.splice(i, 1);
                    }
                }
            }
        }

        // Drawing functions
        function drawBall() {
            ctx.save();
            
            // Ball shadow (animated - scales down as ball goes higher)
            const heightAboveGround = (ground.y - ball.radius) - ball.y;
            const maxHeight = 80; // Maximum expected jump height
            const shadowScale = Math.max(0.2, 1 - (heightAboveGround / maxHeight * 0.8)); // Scale from 1.0 to 0.2
            const shadowOpacity = Math.max(0.1, 0.2 * shadowScale); // Fade shadow as it gets smaller
            
            ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
            ctx.beginPath();
            ctx.ellipse(ball.x + 3, ground.y + 5, 
                ball.radius * 0.8 * shadowScale, 
                ball.radius * 0.3 * shadowScale, 
                0, 0, Math.PI * 2);
            ctx.fill();
            
            // Check if ball is static (standing still on ground)
            const isOnGround = ball.y >= ground.y - ball.radius - 0.5;
            const isMovingSlow = Math.abs(ball.velocity) < 2;
            
            if (isOnGround && isMovingSlow) {
                // HARD-CODED PERFECT CIRCLE - ALWAYS when on ground and slow
                const gradient = ctx.createRadialGradient(
                    ball.x - ball.radius/3, ball.y - ball.radius/3, 0,
                    ball.x, ball.y, ball.radius
                );
                gradient.addColorStop(0, '#7DE3A4');
                gradient.addColorStop(1, ball.color);
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Ball highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.beginPath();
                ctx.arc(ball.x - ball.radius/3, ball.y - ball.radius/3, ball.radius/3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Apply squash-stretch transformation when moving
                ctx.translate(ball.x, ball.y);
                ctx.scale(ball.scaleX, ball.scaleY);
                
                // Ball gradient (with squash-stretch)
                const gradient = ctx.createRadialGradient(
                    -ball.radius/3, -ball.radius/3, 0,
                    0, 0, ball.radius
                );
                gradient.addColorStop(0, '#7DE3A4');
                gradient.addColorStop(1, ball.color);
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Ball highlight (with squash-stretch)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.beginPath();
                ctx.arc(-ball.radius/3, -ball.radius/3, ball.radius/3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        }

        function drawGround() {
            // Ground - LIGHTER WITH 40% TRANSPARENCY to reflect gradient above
            ctx.fillStyle = 'rgba(40, 39, 36, 0.4)'; // 40% transparent taupe
            ctx.fillRect(0, ground.y, canvas.width, ground.height);
            
            // Ground pattern - DARKER TAUPE with slight transparency
            ctx.fillStyle = 'rgba(31, 30, 27, 0.6)'; // 60% opacity darker taupe
            for (let x = 0; x < canvas.width; x += 20) {
                ctx.fillRect(x, ground.y + 10, 10, 5);
            }
        }

        function drawDots() {
            // Simple dot drawing - no orbital complexity
            for (let dot of dots) {
                drawSingleDot(dot);
            }
        }
        
        function drawSingleDot(dot) {
            ctx.save();
            
            // Get opacity (default to 1.0 if not set)
            const opacity = dot.opacity !== undefined ? dot.opacity : 1.0;
            
            if (dot.missed) {
                // Red missed dot
                ctx.shadowColor = `rgba(231, 76, 60, ${0.8 * opacity})`;
                ctx.shadowBlur = dot.radius;
                ctx.fillStyle = `rgba(231, 76, 60, ${1.0 * opacity})`;
            } else {
                // White collectible dot
                ctx.shadowColor = `rgba(255, 255, 255, ${0.8 * opacity})`;
                ctx.shadowBlur = dot.radius;
                ctx.fillStyle = `rgba(255, 255, 255, ${1.0 * opacity})`;
            }
            
            // Main dot
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner highlight
            ctx.shadowBlur = 0;
            if (dot.missed) {
                ctx.fillStyle = `rgba(231, 76, 60, ${0.9 * opacity})`;
            } else {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * opacity})`;
            }
            ctx.beginPath();
            ctx.arc(dot.x - dot.radius/3, dot.y - dot.radius/3, dot.radius/2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }

        function drawBackground() {
            // SYNC GRADIENT SPEED TO GAME SPEED - Better progression rates!
            const baseGradientSpeed = 2; // Start higher (level 2 "Slow") 
            const timeBasedBonus = Math.min(gameTime * 0.00008, 5); // Faster time progression, higher cap
            const scoreBasedBonus = Math.min(score * 0.012, 8); // Faster score progression, higher cap  
            gradientSpeed = baseGradientSpeed + timeBasedBonus + scoreBasedBonus;
            
            // Proper gradient cycling - cycles through ALL 6 phases: 1→2→3→4→5→6→1→2...
            const baseSpeed = 0.00002; // Base slow speed
            const speedMultiplier = gradientSpeed * gradientSpeed; // 1x to 400x speed (exponential!)
            const cycle = gameTime * baseSpeed * speedMultiplier;
            
            // TRUE CYCLING: 0→1→2→3→4→5→0→1... (not oscillating!)
            const phase = (cycle * 6) % 6; // Continuous cycling through all 6 phases
            
            // USE SHARED GRADIENT ARRAY - GUARANTEED IDENTICAL TO TIMELINE
            const colorSchemes = GRADIENT_COLOR_SCHEMES;
            
            // Find current and next color scheme
            const currentIndex = Math.floor(phase) % colorSchemes.length;
            const nextIndex = (currentIndex + 1) % colorSchemes.length;
            const lerpFactor = phase - Math.floor(phase); // 0 to 1
            
            // Interpolate between current and next colors
            const current = colorSchemes[currentIndex];
            const next = colorSchemes[nextIndex];
            
            // Helper function to interpolate hex colors
            function lerpColor(color1, color2, factor) {
                const r1 = parseInt(color1.slice(1, 3), 16);
                const g1 = parseInt(color1.slice(3, 5), 16);
                const b1 = parseInt(color1.slice(5, 7), 16);
                
                const r2 = parseInt(color2.slice(1, 3), 16);
                const g2 = parseInt(color2.slice(3, 5), 16);
                const b2 = parseInt(color2.slice(5, 7), 16);
                
                const r = Math.round(r1 + (r2 - r1) * factor);
                const g = Math.round(g1 + (g2 - g1) * factor);
                const b = Math.round(b1 + (b2 - b1) * factor);
                
                return `rgb(${r}, ${g}, ${b})`;
            }
            
            const topColor = lerpColor(current.top, next.top, lerpFactor);
            const bottomColor = lerpColor(current.bottom, next.bottom, lerpFactor);
            
            // Create gradient background
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, topColor);
            gradient.addColorStop(1, bottomColor);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add subtle floating particles - very dim
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            for (let i = 0; i < 12; i++) {
                const x = (i * 100 + gameTime * 0.05) % (canvas.width + 20);
                const y = 25 + (i * 15) % 160;
                const size = 1; // Small particles
                
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Update string anchor physics
        function updateStringAnchor() {
            // Calculate spring length from slider (20-150% of base 55px distance)
            const lengthMultiplier = springLength / 100;
            const baseDistance = 55; // sqrt(35² + 45²) ≈ 55px
            const newDistance = baseDistance * lengthMultiplier;
            
            // Maintain the same angle but adjust distance
            const angle = Math.atan2(45, 35); // Original angle
            stringAnchor.offsetX = Math.cos(angle) * newDistance;
            stringAnchor.offsetY = Math.sin(angle) * newDistance;
            
            // Subtle weight effect - only sags as ball gets heavier from absorptions
            const baseWeightEffect = (springWeight / 100) * 20;
            const stringBallWeight = stringBall.exists && stringBall.absorptionCount > 0 ? 
                Math.min(stringBall.absorptionCount * 0.3, 4) : 0; // Very subtle sagging, max 4px
            const totalWeightEffect = baseWeightEffect + stringBallWeight;
            
            // Update target position (offset from ball + weight drag)
            stringAnchor.targetX = ball.x + stringAnchor.offsetX;
            stringAnchor.targetY = ball.y + stringAnchor.offsetY + totalWeightEffect;
            
            // Add swaying motion based on ball movement
            stringAnchor.swayTime += stringAnchor.swaySpeed;
            const ballMovement = Math.abs(ball.velocity) * 0.5; // Ball movement affects sway
            stringAnchor.swayX = Math.sin(stringAnchor.swayTime) * (3 + ballMovement);
            
            // FIXED SPRING STIFFNESS: 100% = fixed position, 0% = super bouncy
            if (springStiffness >= 100) {
                // At 100% stiffness: FIXED position (no interpolation)
                stringAnchor.x = stringAnchor.targetX + stringAnchor.swayX;
                stringAnchor.y = stringAnchor.targetY;
            } else {
                // 0-99%: bouncy spring with varying stiffness
                const stiffnessFactor = springStiffness / 100; // 0.0 to 0.99
                const bounciness = 0.01 + stiffnessFactor * 0.49; // 0.01 (super bouncy) to 0.5 (tight)
                
                stringAnchor.x += (stringAnchor.targetX + stringAnchor.swayX - stringAnchor.x) * bounciness;
                stringAnchor.y += (stringAnchor.targetY - stringAnchor.y) * bounciness;
            }
        }

        // Update string ball physics and effects
        function updateStringBall() {
            // Check if we need to create the string ball for reaching
            if (!stringBall.exists) {
                // Create string ball when first dot starts approaching
                let hasApproachingDots = false;
                for (let dot of dots) {
                    if (dot.movingToString) {
                        hasApproachingDots = true;
                        break;
                    }
                }
                
                if (hasApproachingDots) {
                    // Create string ball for reaching
                    stringBall.exists = true;
                    stringBall.x = stringAnchor.x;
                    stringBall.y = stringAnchor.y;
                    stringBall.radius = stringBall.baseRadius; // Start small
                    stringBall.absorptionCount = 0; // No absorptions yet
                    stringBall.falling = false; // CRITICAL: Ensure it's connected, not falling
                } else {
                    return; // No string ball and no approaching dots
                }
            }
            
            // Initialize spring properties if they don't exist
            if (stringBall.velX === undefined) {
                stringBall.velX = 0;
                stringBall.velY = 0;
            }
            
            // CRITICAL SAFEGUARD: During normal gameplay, string ball should NEVER fall
            if (gameRunning && !gamePaused) {
                stringBall.falling = false; // Force reset any incorrect falling state
            }
            
            // Update string ball position to follow anchor
            if (!stringBall.falling) {
                // STEP 1: Calculate pure spring physics position (INDEPENDENT - no reaching influence)
                // Spring position is simply at the anchor (no complex physics)
                const springPosX = stringAnchor.x;
                const springPosY = stringAnchor.y;
                
                // STEP 2: Find closest dot and calculate reaching position (Position B)
                let closestDot = null;
                let closestDistanceFromBall = Infinity;
                
                // Calculate reaching distance - scales with challenge level
                const baseReachDistance = 600;
                const challengeScale = attractionRadius / 80; // Gentle (80) = 1.0, Nightmare (10) = 0.125
                const reachDistance = baseReachDistance * (reachingDistance / 100) * 1.7 * challengeScale;
                
                // UPDATE TARGETING COOLDOWN
                if (targetingCooldown > 0) {
                    targetingCooldown--;
                }
                
                // Find closest dot within REACHING DISTANCE (distance from GREEN BALL)
                // ONLY if cooldown has expired
                if (targetingCooldown <= 0) {
                    for (let dot of dots) {
                        // EXCLUDE ALL COLLECTED DOTS - no matter what
                        // This prevents string ball from following dots that are going to be absorbed
                        const shouldInclude = !dot.missed && !dot.collected;
                        
                        if (shouldInclude) {
                            const dx = ball.x - dot.x; // Distance from GREEN BALL
                            const dy = ball.y - dot.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            // Check if dot is within reaching distance AND is the closest
                            if (distance < reachDistance && distance < closestDistanceFromBall) {
                                closestDistanceFromBall = distance;
                                closestDot = dot;
                            }
                        }
                    }
                }
                
                // STEP 3: TWO-STAGE INTERPOLATION SYSTEM
                
                // Calculate common normalized distance for both interpolations
                const normalizedDistance = closestDot ? (closestDistanceFromBall / reachDistance) : 1.0;
                
                // STAGE 1: ANGULAR INTERPOLATION - Calculate how much spring rotates toward dot
                if (closestDot) {
                    // Calculate angle from GREEN BALL to closest dot
                    const dx = closestDot.x - ball.x;
                    const dy = closestDot.y - ball.y;
                    const angleToTarget = Math.atan2(dy, dx);
                    
                    // SMOOTH ANGULAR INTERPOLATION CURVE: 0 → 0 → 0.8 → 1 → 0
                    if (normalizedDistance <= 1.0) {
                        const t = Math.max(0, 1 - normalizedDistance); // 0 to 1 as we get closer
                        // NEW curve: stays at 0 longer, then jumps to 0.8, then 1.0
                        if (t <= 0.5) {
                            angularInterpolation = 0; // Stay at 0 for first 50%
                        } else if (t <= 0.8) {
                            angularInterpolation = (t - 0.5) * 2.67; // 0 to 0.8 over next 30% (0.8/0.3 = 2.67)
                        } else if (t <= 0.9) {
                            angularInterpolation = 0.8 + (t - 0.8) * 2.0; // 0.8 to 1.0 over next 10% (0.2/0.1 = 2.0)
                        } else {
                            angularInterpolation = 1.0; // Stay at 1.0 for closest 10%
                        }
                    } else {
                        angularInterpolation = 0.0;
                    }
                    
                    // PROPER ANGULAR ROTATION - Interpolate angle, not positions!
                    
                    // 1. Calculate original spring angle from green ball center
                    const originalSpringAngle = Math.atan2(springPosY - ball.y, springPosX - ball.x);
                    const springDistance = Math.sqrt(
                        (springPosX - ball.x) * (springPosX - ball.x) + 
                        (springPosY - ball.y) * (springPosY - ball.y)
                    );
                    
                    // 2. Calculate PURPLE: Full target rotation position (perfect angle alignment)
                    const targetRotationPosX = ball.x + Math.cos(angleToTarget) * springDistance;
                    const targetRotationPosY = ball.y + Math.sin(angleToTarget) * springDistance;
                    
                    // 3. Interpolate the ANGLE (not the position!)
                    let angleDifference = angleToTarget - originalSpringAngle;
                    
                    // Handle angle wrapping (shortest path)
                    if (angleDifference > Math.PI) angleDifference -= 2 * Math.PI;
                    if (angleDifference < -Math.PI) angleDifference += 2 * Math.PI;
                    
                    // 4. Calculate current interpolated angle
                    const currentAngle = originalSpringAngle + angleDifference * angularInterpolation;
                    
                    // 5. Calculate YELLOW: Rotated position using interpolated angle
                    const rotatedPhysicalPosX = ball.x + Math.cos(currentAngle) * springDistance;
                    const rotatedPhysicalPosY = ball.y + Math.sin(currentAngle) * springDistance;
                    
                    // SMOOTH REACHING INTERPOLATION CURVE: 0 → 0 → 0.1 → 0.2 → 0
                    if (normalizedDistance <= 1.0) {
                        const t = Math.max(0, 1 - normalizedDistance); // 0 to 1 as we get closer
                        // NEW curve: stays at 0 longer, then gentle rise to 0.2
                        if (t <= 0.6) {
                            reachingInterpolation = 0; // Stay at 0 for first 60%
                        } else if (t <= 0.8) {
                            reachingInterpolation = (t - 0.6) * 0.5; // 0 to 0.1 over next 20% (0.1/0.2 = 0.5)
                        } else if (t <= 0.9) {
                            reachingInterpolation = 0.1 + (t - 0.8) * 1.0; // 0.1 to 0.2 over next 10% (0.1/0.1 = 1.0)
                        } else {
                            reachingInterpolation = 0.2; // Stay at 0.2 for closest 10%
                        }
                    } else {
                        reachingInterpolation = 0;
                    }
                    
                    // Final position: Lerp from rotated physical position to actual dot position
                    stringBall.x = rotatedPhysicalPosX + (closestDot.x - rotatedPhysicalPosX) * reachingInterpolation;
                    stringBall.y = rotatedPhysicalPosY + (closestDot.y - rotatedPhysicalPosY) * reachingInterpolation;
                    
                    // Reset decay when actively reaching
                    reachingDecay = 0;
                    

                    

                    
                } else {
                    // NO DOT FOUND - SMOOTH RETURN TO ANCHOR POSITION
                    // Gradually decay interpolation values for smooth transition
                    const decayRate = 0.08; // How fast to return to anchor (higher = faster)
                    
                    angularInterpolation *= (1 - decayRate);
                    reachingInterpolation *= (1 - decayRate);
                    
                    // When interpolation values are very small, snap to anchor to avoid floating point issues
                    if (angularInterpolation < 0.01 && reachingInterpolation < 0.01) {
                        angularInterpolation = 0;
                        reachingInterpolation = 0;
                        stringBall.x = springPosX;
                        stringBall.y = springPosY;
                        
                    } else {
                        // Smooth transition back to anchor using current interpolation values
                        // Calculate the current position based on decaying interpolation
                        stringBall.x += (springPosX - stringBall.x) * decayRate;
                        stringBall.y += (springPosY - stringBall.y) * decayRate;
                    }
                    
                    // SAFEGUARD: Check for invalid positions and reset
                    if (isNaN(stringBall.x) || isNaN(stringBall.y)) {
                        console.error("String ball position became NaN! Resetting to anchor.");
                        stringBall.x = stringAnchor.x;
                        stringBall.y = stringAnchor.y;
                        angularInterpolation = 0;
                        reachingInterpolation = 0;
                    }
                }
                

                
            } else {
                // During game over - string ball falls with physics
                stringBall.vy += 0.4; // Gravity
                stringBall.x += stringBall.vx;
                stringBall.y += stringBall.vy;
                
                // Bounce on ground
                if (stringBall.y + stringBall.radius > ground.y) {
                    stringBall.y = ground.y - stringBall.radius;
                    stringBall.vy *= -0.6; // Bounce with damping
                    stringBall.vx *= 0.8; // Rolling friction
                }
            }
            
            // Visual effects decay
            if (stringBall.absorptionFlash > 0) {
                stringBall.absorptionFlash--;
            }
            
            if (stringBall.growthScale > 1) {
                stringBall.growthScale += (1 - stringBall.growthScale) * 0.15; // Return to normal size
            }
            
            if (stringBall.glowIntensity > 0) {
                stringBall.glowIntensity *= 0.95; // Gradual glow fade
            }
            
            // ✨ CAPTURE HIGHLIGHT - Update highlight timer and fade
            if (stringBall.captureTimer > 0) {
                stringBall.captureTimer--;
                stringBall.captureHighlight = stringBall.captureTimer / 30; // Linear fade over 30 frames
            } else {
                stringBall.captureHighlight = 0; // Ensure it's fully off
            }
        }

        // Draw string ball with visual effects
        function drawStringBall() {
            if (!stringBall.exists) return;
            
            ctx.save();
            

            
            // Calculate dynamic color based on absorption count
            const hue = Math.min(stringBall.absorptionCount * 15, 120); // From red-ish to green
            const lightness = 60 + stringBall.absorptionCount * 2; // Gets slightly lighter
            
            // ✨ REACHING SCALE - Ball grows larger while reaching for dots!
            const reachingScale = 1 + (angularInterpolation * 0.8) + (reachingInterpolation * 1.2); // Scale up to 2x when fully reaching
            
            // Growth scale animation
            const currentScale = stringBall.growthScale * reachingScale; // Combine both effects
            const drawRadius = stringBall.radius * currentScale;
            
            // NO VISUAL EFFECTS - clean white ball
            
            // Main string ball with WHITE gradient (like the dots)
            const gradient = ctx.createRadialGradient(
                stringBall.x - drawRadius/3, stringBall.y - drawRadius/3, 0,
                stringBall.x, stringBall.y, drawRadius
            );
            gradient.addColorStop(0, '#FFFFFF'); // White center
            gradient.addColorStop(1, '#E8E8E8'); // Light gray edge
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(stringBall.x, stringBall.y, drawRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(stringBall.x - drawRadius/3, stringBall.y - drawRadius/3, drawRadius/3, 0, Math.PI * 2);
            ctx.fill();
            
            // ✨ CAPTURE HIGHLIGHT - Single growing circle that expands and disappears!
            if (stringBall.captureHighlight > 0) {
                const progress = 1 - stringBall.captureHighlight; // 0 to 1 as time progresses
                const startRadius = Math.max(2, drawRadius - 6); // Start smaller than ball, but never below 2px
                const maxGrowth = 30; // How much it can grow
                const currentRadius = startRadius + (progress * maxGrowth); // Grows from smaller start to larger
                const opacity = stringBall.captureHighlight * 0.9; // Fades as it grows
                
                // Single expanding bright white circle - THICKER
                ctx.shadowColor = `rgba(255, 255, 255, ${opacity * 0.6})`;
                ctx.shadowBlur = 8;
                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                ctx.lineWidth = 6; // Much thicker line
                ctx.beginPath();
                ctx.arc(stringBall.x, stringBall.y, currentRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            ctx.restore();
        }

        // Game loop with pause functionality
        function gameLoop() {
            if (gameRunning) {
                // Always update ball physics (even when paused)
                updateBall();
                updateStringAnchor(); // Update string anchor
                updateStringBall(); // Update string ball
                
                if (!gamePaused) {
                    // Only update incoming dots when not paused
                    updateDots();
                    // Increase speed gradually
                    gameSpeed = 3 + Math.floor(score / 200) * 0.5;
                }
            } else if (gameOverFalling) {
                // During game over: ball can still move, dots fall
                updateBall(); // Ball physics continue!
                updateStringAnchor(); // String anchor continues!
                updateStringBall(); // String ball continues!
                updateFallingDots(); // Falling dots with gravity
            }
            
            // Always draw everything (paused or not)
            drawBackground();
            drawGround();
            drawDots();
            drawObstacles(); // Draw obstacles
            drawBall();
            drawStringBall(); // Draw string ball
            drawCollisionEffects(); // Draw collision effects
            
            // Update collision effects
            updateCollisionEffects();
            

            

            

            
            requestAnimationFrame(gameLoop);
        }

        // Update falling dots during game over
        function updateFallingDots() {
            for (let i = dots.length - 1; i >= 0; i--) {
                const dot = dots[i];
                
                // Only apply gravity to dots that are actually falling (not frozen, not orbiting)
                if (dot.falling) {
                    dot.vy += 0.3; // Gravity for dots
                    dot.x += dot.vx;
                    dot.y += dot.vy;
                    
                    // Remove dots that fall off screen
                    if (dot.y > canvas.height + 50) {
                        dots.splice(i, 1);
                    }
                }
                // Frozen dots stay exactly where they are (no velocity updates)
                // Orbiting dots are handled by updateOrbitingDots()
            }
        }

        // Update only the orbital mechanics when paused
        function updateOrbitingDots() {
            for (let i = dots.length - 1; i >= 0; i--) {
                const dot = dots[i];
                
                if (dot.orbiting) {
                    // Continue orbital motion even when paused
                    dot.lerpTime = Math.min(1, dot.lerpTime + 0.015);
                    dot.lerpFactor = dot.lerpTime * dot.lerpTime * dot.lerpTime;
                    
                    // Spring physics for orbit center following the ball
                    const springStrength = 0.02 + (orbitalSpringiness / 100) * 0.1; // 0.02 to 0.12 spring strength
                    const damping = 0.7 + (orbitalSpringiness / 100) * 0.25; // 0.7 to 0.95 damping
                    
                    // Calculate spring forces
                    const dx = ball.x - dot.orbitCenterX;
                    const dy = ball.y - dot.orbitCenterY;
                    
                    // Apply spring force to velocity
                    dot.orbitCenterVelX += dx * springStrength;
                    dot.orbitCenterVelY += dy * springStrength;
                    
                    // Apply damping
                    dot.orbitCenterVelX *= damping;
                    dot.orbitCenterVelY *= damping;
                    
                    // Update position
                    dot.orbitCenterX += dot.orbitCenterVelX;
                    dot.orbitCenterY += dot.orbitCenterVelY;
                    
                    // Advance phase
                    dot.orbitPhase += dot.orbitSpeed;
                    
                    // Track orbit time for string clustering transition (EVEN WHEN PAUSED)
                    dot.orbitTime += 1;
                    
                    // After orbiting for ~8-12 seconds, start gravitating to string cluster
                    if (dot.orbitTime > 480 + Math.random() * 240) {
                        dot.stringClustering = true;
                        dot.orbiting = false;
                    }
                    
                    // Calculate orbital position
                    const cos_phase = Math.cos(dot.orbitPhase);
                    const sin_phase = Math.sin(dot.orbitPhase);
                    const cos_angle = Math.cos(dot.orbitAngle);
                    const sin_angle = Math.sin(dot.orbitAngle);
                    
                    const orbitX = dot.orbitCenterX + 
                        (dot.orbitA * cos_phase * cos_angle - dot.orbitB * sin_phase * sin_angle);
                    const orbitY = dot.orbitCenterY + 
                        (dot.orbitA * cos_phase * sin_angle + dot.orbitB * sin_phase * cos_angle);
                    
                    // Calculate 3D depth
                    dot.zDepth = Math.cos(dot.orbitPhase + Math.PI/2);
                    
                    // Update position (full orbital motion since already caught)
                    dot.x = orbitX;
                    dot.y = orbitY;
                } else if (dot.stringClustering) {
                    // CONTINUE STRING CLUSTERING EVEN WHEN PAUSED
                    const targetX = stringAnchor.x;
                    const targetY = stringAnchor.y;
                    
                    // Calculate distance to anchor
                    const distanceToAnchor = Math.sqrt(
                        (targetX - dot.x) * (targetX - dot.x) + 
                        (targetY - dot.y) * (targetY - dot.y)
                    );
                    
                    // ABSORPTION CHECK - when close enough (~10px)
                    if (distanceToAnchor < 10) {
                        // CREATE/GROW STRING BALL
                        if (!stringBall.exists) {
                            // First absorption - create the string ball
                            stringBall.exists = true;
                            stringBall.x = stringAnchor.x;
                            stringBall.y = stringAnchor.y;
                            stringBall.radius = stringBall.baseRadius; // Start at 8px
                            stringBall.absorptionCount = 1;
                        } else {
                            // Subsequent absorptions - grow the ball (controlled by slider)
                            stringBall.absorptionCount++;
                            const growthAmount = (growthRate / 100) * 1.0; // 0.1px to 2.0px per absorption based on slider
                            stringBall.radius = Math.min(25, stringBall.baseRadius + (stringBall.absorptionCount - 1) * growthAmount);
                        }
                        
                        // Remove the absorbed dot
                        dots.splice(i, 1);
                        continue;
                    }
                    
                    // MOVEMENT TOWARD ANCHOR - slow and deliberate
                    dot.x += (targetX - dot.x) * 0.025; // Slow attraction
                    dot.y += (targetY - dot.y) * 0.025;
                    
                    // Visual feedback - dot gets slightly smaller as it approaches
                    dot.zDepth = 0.7; // Slightly transparent
                }
            }
        }

        function gameOver() {
            gameRunning = false;
            gameOverFalling = true;
            finalScoreElement.textContent = score;
            
            // Position popup centered over canvas
            const canvasRect = canvas.getBoundingClientRect();
            const containerRect = canvas.parentElement.getBoundingClientRect();
            
            gameOverElement.style.left = (canvasRect.left - containerRect.left + canvasRect.width/2) + 'px';
            gameOverElement.style.top = (canvasRect.top - containerRect.top + canvasRect.height/2) + 'px';
            gameOverElement.style.transform = 'translate(-50%, -50%)';
            
            // Show game over popup immediately
            gameOverElement.style.display = 'block';
            
            // Mark all linear/incoming dots as frozen (don't change orbiting dots yet)
            for (let dot of dots) {
                if (!dot.orbiting) {
                    dot.vx = 0; // Stop horizontal movement
                    dot.vy = 0; // Stop vertical movement
                    dot.frozen = true; // Mark as frozen
                }
            }
            
            // After 10 seconds, make ALL dots fall (both frozen and orbiting) + string ball
            setTimeout(() => {
                for (let dot of dots) {
                    if (dot.orbiting) {
                        // Release orbiting dots
                        dot.orbiting = false;
                        dot.attracted = false;
                        dot.vx = (Math.random() - 0.5) * 2; // Random horizontal velocity
                        dot.vy = Math.random() * -3 - 1; // Slight upward velocity for natural arc
                    } else if (dot.frozen) {
                        // Release frozen incoming dots
                        dot.frozen = false;
                        dot.vx = (Math.random() - 0.5) * 2; // Random horizontal velocity
                        dot.vy = Math.random() * -3 - 1; // Slight upward velocity for natural arc
                    }
                    dot.falling = true; // Mark ALL dots as falling
                }
                
                // Make string ball fall too
                if (stringBall.exists) {
                    stringBall.falling = true;
                    stringBall.vx = (Math.random() - 0.5) * 1; // Small horizontal velocity
                    stringBall.vy = Math.random() * -2; // Slight upward velocity
                }
            }, 10000); // 10 seconds
        }

        function restartGame() {
            gameRunning = true;
            gameOverFalling = false;
            score = 0;
            redPoints = 0;
            gameSpeed = 3;
            gameTime = 0;
            
            // PROPERLY RESET BALL POSITION AND STATE - DROP FROM HIGHER!
            ball.x = 80; // Reset horizontal position!
            ball.y = 120; // Drop from much higher (was 220)
            ball.velocity = 0;
            ball.bouncing = false;
            ball.scaleX = 1; // Reset scale
            ball.scaleY = 1; // Reset scale
            ball.impactTimer = 0;
            
            // RESET ALL COLLISION EFFECTS
            ballSmashed.active = false;
            ballSmashed.slideVx = 0;
            ballSmashed.flatness = 1.0;
            
            ballBouncing.active = false;
            ballBouncing.vx = 0;
            ballBouncing.vy = 0;
            ballBouncing.bounces = 0;
            
            ballMelting.active = false;
            ballMelting.droplets = [];
            
            // Reset obstacles and dots
            obstacles = [];
            obstacleTimer = 0;
            dots = [];
            dotTimer = 0;
            
            // Reset string ball
            stringBall.exists = false;
            stringBall.absorptionCount = 0;
            stringBall.radius = stringBall.baseRadius;
            stringBall.glowIntensity = 0;
            stringBall.growthScale = 1;
            stringBall.absorptionFlash = 0;
            stringBall.falling = false;
            stringBall.vx = 0;
            stringBall.vy = 0;
            
            // Reset interpolation states
            angularInterpolation = 0;
            reachingInterpolation = 0;
            reachingDecay = 0;
            targetingCooldown = 0;
            
            scoreElement.textContent = score;
            redPointsElement.textContent = redPoints;
            gameOverElement.style.display = 'none';
        
try { document.body.classList.remove('paused'); if (pauseBtn) pauseBtn.textContent = '⏸'; } catch(_) {}

}

        // Debug visualization function for two-stage interpolation
        function drawDebugLerpPositions() {
            ctx.save();
            
            // 1. RED DOT: Original Spring/Anchor Position 
            ctx.fillStyle = '#FF0000'; // Bright red
            ctx.beginPath();
            ctx.arc(debugSpringPos.x, debugSpringPos.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // 2. PURPLE DOT: Full Target Rotation Position (100% rotated toward dot)
            ctx.fillStyle = '#800080'; // Purple
            ctx.beginPath();
            ctx.arc(debugTargetRotationPos.x, debugTargetRotationPos.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // 3. YELLOW DOT: Current Rotated Position (lerp between red and purple)
            if (debugRotatedPos) {
                ctx.fillStyle = '#FFFF00'; // Bright yellow
                ctx.beginPath();
                ctx.arc(debugRotatedPos.x, debugRotatedPos.y, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // 3. BLUE DOT: Actual Dot Position (target for reaching)
            ctx.fillStyle = '#0000FF'; // Bright blue
            ctx.beginPath();
            ctx.arc(debugReachingPos.x, debugReachingPos.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            // 4. GREEN DOT: Final String Ball Position (after both interpolations)
            ctx.fillStyle = '#00FF00'; // Bright green
            ctx.beginPath();
            ctx.arc(debugFinalPos.x, debugFinalPos.y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // 5. LINES: Show the two-stage interpolation chain
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            
            // Line 1: Green ball center to Purple (shows target rotation angle)
            ctx.strokeStyle = 'rgba(128, 0, 128, 0.5)'; // Purple line
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ball.x, ball.y);
            ctx.lineTo(debugTargetRotationPos.x, debugTargetRotationPos.y);
            ctx.stroke();
            
            // Line 2: Purple to Blue (shows straight line to dot)
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)'; // Blue line
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(debugTargetRotationPos.x, debugTargetRotationPos.y);
            ctx.lineTo(debugReachingPos.x, debugReachingPos.y);
            ctx.stroke();
            
            // Line 3: Red to Yellow (angular interpolation)
            if (debugRotatedPos) {
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)'; // Yellow line
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(debugSpringPos.x, debugSpringPos.y);
                ctx.lineTo(debugRotatedPos.x, debugRotatedPos.y);
                ctx.stroke();
                
                // Line 4: Yellow to Green (reaching interpolation)
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'; // Green line
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(debugRotatedPos.x, debugRotatedPos.y);
                ctx.lineTo(debugFinalPos.x, debugFinalPos.y);
                ctx.stroke();
            }
            
            // 6. TEXT: Show both interpolation factors
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Courier New';
            ctx.fillText(`Angular: ${angularInterpolation.toFixed(2)}`, debugFinalPos.x + 10, debugFinalPos.y - 20);
            ctx.fillText(`Reaching: ${reachingInterpolation.toFixed(2)}`, debugFinalPos.x + 10, debugFinalPos.y - 5);
            
            ctx.restore();
        }

        // Draw obstacles
        function drawObstacles() {
            for (let obstacle of obstacles) {
                ctx.save();
                
                if (obstacle.type === 'spike') {
                    // Draw spikes
                    ctx.fillStyle = '#e74c3c';
                    ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height);
                    
                    ctx.beginPath();
                    ctx.moveTo(-obstacle.width / 2, 0);
                    ctx.lineTo(0, -obstacle.height);
                    ctx.lineTo(obstacle.width / 2, 0);
                    ctx.closePath();
                    ctx.fill();
                    
                    // Spike highlight
                    ctx.fillStyle = '#f39c12';
                    ctx.beginPath();
                    ctx.moveTo(-obstacle.width / 4, -obstacle.height / 4);
                    ctx.lineTo(0, -obstacle.height);
                    ctx.lineTo(obstacle.width / 4, -obstacle.height / 4);
                    ctx.closePath();
                    ctx.fill();
                    
                } else if (obstacle.type === 'block') {
                    // Draw blocks
                    ctx.fillStyle = '#95a5a6';
                    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
                    
                    // Block highlight
                    ctx.fillStyle = '#bdc3c7';
                    ctx.fillRect(obstacle.x + 2, obstacle.y + 2, obstacle.width - 4, obstacle.height / 3);
                    
                } else if (obstacle.type === 'saw') {
                    // Draw rotating saws
                    ctx.translate(obstacle.x, obstacle.y);
                    ctx.rotate(obstacle.rotation);
                    
                    // Saw blade
                    ctx.fillStyle = '#2c3e50';
                    ctx.beginPath();
                    for (let i = 0; i < 8; i++) {
                        const angle = (i / 8) * Math.PI * 2;
                        const innerRadius = obstacle.radius * 0.7;
                        const outerRadius = obstacle.radius;
                        
                        const x1 = Math.cos(angle) * innerRadius;
                        const y1 = Math.sin(angle) * innerRadius;
                        const x2 = Math.cos(angle + 0.2) * outerRadius;
                        const y2 = Math.sin(angle + 0.2) * outerRadius;
                        const x3 = Math.cos(angle + 0.4) * innerRadius;
                        const y3 = Math.sin(angle + 0.4) * innerRadius;
                        
                        if (i === 0) ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.lineTo(x3, y3);
                    }
                    ctx.closePath();
                    ctx.fill();
                    
                    // Center bolt
                    ctx.fillStyle = '#34495e';
                    ctx.beginPath();
                    ctx.arc(0, 0, obstacle.radius * 0.2, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                ctx.restore();
            }
        }

        // 3 DRAMATIC COLLISION EFFECTS - NO PARTICLES!
        
        // Apply collision effect based on current selection
        function applyCollisionEffect(x, y) {
            switch (currentCollisionEffect) {
                case 0: // Smash
                    effectSmash(x, y);
                    break;
                case 1: // Bounce
                    effectBounce(x, y);
                    break;
                case 2: // Melt
                    effectMelt(x, y);
                    break;
            }
        }

        // Effect 1: SMASH - Ball gets flattened and slides
        function effectSmash(x, y) {
            ballSmashed.active = true;
            ballSmashed.slideVx = -6; // Slide backward
            ballSmashed.flatness = 0.1; // Completely flat
            ball.scaleX = 3.0; // Very wide
            ball.scaleY = 0.1; // Very flat
            ball.y = ground.y - 2; // Stick to ground
            ball.velocity = 0; // Stop bouncing
        }

        // Effect 2: BOUNCE - Ball gets knocked around violently
        function effectBounce(x, y) {
            ballBouncing.active = true;
            ballBouncing.vx = -12; // Strong knockback
            ballBouncing.vy = -15; // High bounce
            ballBouncing.bounces = 0;
            ball.x += ballBouncing.vx * 0.1; // Immediate knockback
            ball.velocity = ballBouncing.vy; // Set vertical velocity
        }

        // Effect 3: MELT - Ball loses shape and drips
        function effectMelt(x, y) {
            ballMelting.active = true;
            ballMelting.droplets = [];
            
            // Create melting droplets
            for (let i = 0; i < 12; i++) {
                ballMelting.droplets.push({
                    x: x + (Math.random() - 0.5) * ball.radius,
                    y: y + ball.radius * 0.5,
                    vx: (Math.random() - 0.5) * 4,
                    vy: Math.random() * 2,
                    size: 2 + Math.random() * 4,
                    life: 120
                });
            }
            
            ball.scaleY = 0.3; // Start melting down
        }

        // Update collision effects
        function updateCollisionEffects() {
            // Update smash effect
            if (ballSmashed.active) {
                ball.x += ballSmashed.slideVx;
                ballSmashed.slideVx *= ballSmashed.friction;
                
                if (Math.abs(ballSmashed.slideVx) < 0.1) {
                    ballSmashed.active = false;
                }
            }
            
            // Update bounce effect
            if (ballBouncing.active) {
                ball.x += ballBouncing.vx;
                ballBouncing.vx *= 0.95; // Air resistance
                
                // Count bounces on ground
                if (ball.y >= ground.y - ball.radius) {
                    ballBouncing.bounces++;
                    ballBouncing.vx *= 0.7; // Lose energy each bounce
                    
                    if (ballBouncing.bounces >= ballBouncing.maxBounces) {
                        ballBouncing.active = false;
                    }
                }
            }
            
            // Update melt effect
            if (ballMelting.active) {
                // Ball slowly melts down
                ball.scaleY = Math.max(0.1, ball.scaleY * 0.98);
                ball.scaleX = Math.min(2.0, ball.scaleX * 1.01);
                
                // Update droplets
                for (let i = ballMelting.droplets.length - 1; i >= 0; i--) {
                    const droplet = ballMelting.droplets[i];
                    droplet.x += droplet.vx;
                    droplet.y += droplet.vy;
                    droplet.vy += 0.3; // Gravity
                    droplet.vx *= 0.98; // Air resistance
                    droplet.life--;
                    
                    // Remove old droplets
                    if (droplet.life <= 0 || droplet.y > ground.y + 10) {
                        ballMelting.droplets.splice(i, 1);
                    }
                }
                
                // End melting after droplets are gone
                if (ballMelting.droplets.length === 0) {
                    ballMelting.active = false;
                }
            }
        }

        // Draw collision effects
        function drawCollisionEffects() {
            // Draw melt droplets
            if (ballMelting.active) {
                ctx.save();
                for (let droplet of ballMelting.droplets) {
                    const alpha = droplet.life / 120;
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = ball.color;
                    ctx.beginPath();
                    ctx.arc(droplet.x, droplet.y, droplet.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // DEBUG MODE: Draw debug indicator
        function drawDebugIndicator() {
            ctx.save();
            
            // Draw debug box RIGHT ABOVE the green ball - larger and more visible
            const boxWidth = 200;
            const boxHeight = 60;
            const boxX = ball.x - boxWidth/2; // Center above ball
            const boxY = ball.y - ball.radius - boxHeight - 10; // Just above the ball
            
            // No background box - just the circle
            
            // Color indicator circle - MUCH LARGER
            ctx.fillStyle = debugColor;
            ctx.beginPath();
            ctx.arc(boxX + 30, boxY + 30, 20, 0, Math.PI * 2); // Bigger circle
            ctx.fill();
            
            // Circle border
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Text label - larger font
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px Courier New';
            ctx.fillText(debugLabel, boxX + 60, boxY + 35);
            
            ctx.restore();
        }

        // Radio button functionality
        document.querySelectorAll('input[name="collision"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentCollisionEffect = parseInt(e.target.value);
            });
        });

        // NEW: Complete gradient timeline system with hex codes
        function createGradientTimeline() {
            const gradientSections = document.getElementById('gradientSections');
            
            // USE SHARED GRADIENT ARRAY - GUARANTEED IDENTICAL TO BACKGROUND
            const colorSchemes = GRADIENT_COLOR_SCHEMES;
            
            // Clear existing content
            gradientSections.innerHTML = '';
            
            // Create sections dynamically
            colorSchemes.forEach((scheme, index) => {
                const section = document.createElement('div');
                section.className = 'gradient-section';
                section.dataset.index = index;
                
                // Create gradient preview
                const preview = document.createElement('div');
                preview.className = 'section-preview';
                preview.style.background = `linear-gradient(to bottom, ${scheme.top}, ${scheme.bottom})`;
                
                // Section number
                const number = document.createElement('div');
                number.className = 'section-number';
                number.textContent = `${index + 1}`;
                
                // Hex codes container
                const hexCodes = document.createElement('div');
                hexCodes.className = 'hex-codes';
                
                // Top hex code
                const topHex = document.createElement('div');
                topHex.className = 'hex-code';
                topHex.textContent = scheme.top;
                
                // Bottom hex code
                const bottomHex = document.createElement('div');
                bottomHex.className = 'hex-code';
                bottomHex.textContent = scheme.bottom;
                
                hexCodes.appendChild(topHex);
                hexCodes.appendChild(bottomHex);
                
                // Assemble section
                section.appendChild(number);
                section.appendChild(preview);
                section.appendChild(hexCodes);
                
                gradientSections.appendChild(section);
            });
        }
        
        // Helper function to average two hex colors
        function averageColors(color1, color2) {
            const r1 = parseInt(color1.slice(1, 3), 16);
            const g1 = parseInt(color1.slice(3, 5), 16);
            const b1 = parseInt(color1.slice(5, 7), 16);
            
            const r2 = parseInt(color2.slice(1, 3), 16);
            const g2 = parseInt(color2.slice(3, 5), 16);
            const b2 = parseInt(color2.slice(5, 7), 16);
            
            const r = Math.round((r1 + r2) / 2);
            const g = Math.round((g1 + g2) / 2);
            const b = Math.round((b1 + b2) / 2);
            
            return `rgb(${r}, ${g}, ${b})`;
        }
        
        // Update timeline to show current gradient phase
        function updateGradientTimeline() {
            const gradientSections = document.getElementById('gradientSections');
            const positionText = document.querySelector('.position-text');
            
            if (!gradientSections || !positionText) return;
            
            // Calculate current phase in the cycle (EXACTLY SAME AS BACKGROUND)
            const baseSpeed = 0.00002;
            const speedMultiplier = gradientSpeed * gradientSpeed; // Exponential like background
            const cycle = gameTime * baseSpeed * speedMultiplier;
            const phase = (cycle * 6) % 6; // TRUE CYCLING - MATCHES drawBackground exactly!
            
            // Find which section is currently active
            const currentSectionIndex = Math.floor(phase) % 6;
            const progressInSection = phase - Math.floor(phase);
            
            // Update all sections
            const sections = gradientSections.querySelectorAll('.gradient-section');
            sections.forEach((section, index) => {
                const preview = section.querySelector('.section-preview');
                if (index === currentSectionIndex) {
                    section.classList.add('section-active');
                    preview.classList.add('active');
                } else {
                    section.classList.remove('section-active');
                    preview.classList.remove('active');
                }
            });
            
            // Update position text with current phase info
            const sectionNames = ['Cool Gray', 'Warm Taupe', 'Medium Brown', 'Rich Brown', 'Dark Brown', 'Deep Burgundy'];
            const currentSectionName = sectionNames[currentSectionIndex];
            const progressPercent = Math.round(progressInSection * 100);
            
            positionText.textContent = `Phase ${currentSectionIndex + 1}: ${currentSectionName} (${progressPercent}%)`;
        }
        
        // Speed sync display update function
        function updateSpeedSyncDisplay() {
            const gameSpeedText = document.getElementById('gameSpeedText');
            const gradientSpeedText = document.getElementById('gradientSpeedText');
            
            if (!gameSpeedText || !gradientSpeedText) return;
            
            // Calculate current game speed (with time bonus)
            const timeSpeedBonus = Math.min(gameTime * 0.0001, 2);
            const currentGameSpeed = gameSpeed + timeSpeedBonus;
            
            // Get gradient speed name from levels
            const roundedGradientSpeed = Math.round(gradientSpeed);
            const clampedGradientSpeed = Math.max(1, Math.min(20, roundedGradientSpeed));
            const gradientSpeedName = gradientSpeedLevels[clampedGradientSpeed] || "UNKNOWN";
            
            // Update display
            gameSpeedText.textContent = currentGameSpeed.toFixed(1);
            gradientSpeedText.textContent = gradientSpeedName;
        }
        
        // Start the game
        gameLoop();

// === Bootstrap wiring for non-module (file:// friendly) ===
document.addEventListener('DOMContentLoaded', () => {
  const attach = (id) => {
    const el = document.getElementById(id);
    if (el && typeof window.restartGame === 'function') {
      el.addEventListener('click', (e) => { e.preventDefault(); window.restartGame(); });
    }
  };
  attach('restartBtn');
  attach('playAgainBtn');
});


// === Mobile enhancements: safe tap-to-jump & gesture blockers ===
(function(){
  const isInteractive = (el) => {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (['input','select','textarea','button','a','label'].includes(tag)) return true;
    // role-based
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    if (['slider','button','link','switch'].includes((role||'').toLowerCase())) return true;
    // contentEditable
    if (el.isContentEditable) return true;
    // Slider thumbs are inside input; handled above.
    return false;
  };

  let lastTouchTime = 0;

  // Global touchstart -> jump unless on UI control
  const onGlobalTouchStart = (e) => {
    const now = Date.now();
    // Prevent iOS double-tap zoom
    if (now - lastTouchTime < 300) e.preventDefault();
    lastTouchTime = now;

    const target = e.target;
    if (isInteractive(target)) return; // let UI controls work

    // Block page gestures
    e.preventDefault();

    try {
      if (typeof gameRunning !== 'undefined' && typeof restartGame === 'function' && typeof jump === 'function') {
        if (!gameRunning) {
          restartGame();
        } else if (typeof gamePaused === 'boolean' && !gamePaused) {
          jump();
        } else {
          jump();
        }
      }
    } catch(_) {}
  };

  // Prevent scroll/pinch/long-press artefacts
  const prevent = (ev) => { ev.preventDefault(); };
  ['touchstart','touchmove','touchend','gesturestart','gesturechange','gestureend'].forEach(type => {
    // Use non-passive to allow preventDefault
    window.addEventListener(type, prevent, { passive: false });
  });

  // Also suppress context menu and selection
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('selectstart', (e) => e.preventDefault());

  // Map global taps to jump
  window.addEventListener('touchstart', onGlobalTouchStart, { passive: false });

  // Also allow mouse/tap anywhere (outside controls) to jump
  window.addEventListener('click', (e) => {
    const t = e.target;
    if (isInteractive(t)) return;
    if (typeof gameRunning !== 'undefined' && typeof restartGame === 'function' && typeof jump === 'function') {
      if (!gameRunning) {
        restartGame();
      } else if (typeof gamePaused === 'boolean' && !gamePaused) {
        jump();
      } else {
        jump();
      }
    }
  }, true);

  // Responsive CSS size only; keep logic resolution 1200x300
  const canvas = document.getElementById('gameCanvas');
  if (canvas) {
    // Prevent default on touch on canvas to avoid scrolling
    ['touchstart','touchmove','touchend'].forEach(type => {
      canvas.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    });
  }

  // Orientation tidy-up (no logic resize necessary because CSS handles it)
  window.addEventListener('orientationchange', () => {
    // Kick a reflow
    if (canvas) {
      const w = canvas.style.width;
      canvas.style.width = w; // no-op, forces layout
    }
  });
})();

const GAME_WIDTH = 720;
const GAME_HEIGHT = 400;

function initGame() {
    const container = document.getElementById('gameContainer');
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;
    container.appendChild(canvas);

    // Menu DOM
    let menu = document.createElement('div');
    menu.className = 'menu visible';
    menu.innerHTML = `
        <h1>RogueRun RPG</h1>
        <p>Side-Scrolling Roguelike Adventure<br>
        <span style="font-size:0.9em">← → to move, Z to attack, X to dash</span></p>
        <button id="startBtn">Start Game</button>
    `;
    container.appendChild(menu);

    const startGame = () => {
        menu.classList.remove('visible');
        game.reset();
        game.running = true;
        game.render();
    };

    document.getElementById('startBtn').onclick = startGame;

    const game = new Game(canvas, () => {
        // Show menu when game over
        menu.innerHTML = `
            <h1>Game Over!</h1>
            <p>Enemies defeated: ${game.stats.kills}<br>Max Level: ${game.stats.level}</p>
            <button id="restartBtn">Restart</button>
        `;
        menu.classList.add('visible');
        document.getElementById('restartBtn').onclick = startGame;
    });

    // Show initial menu & draw intro background
    game.render();
}
window.addEventListener('DOMContentLoaded', initGame);

// ----------- GAME CLASSES ---------------

class Game {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.onGameOver = onGameOver;

        this.running = false;
        this.lastFrame = 0;
        this.keys = {};
        this.stats = { kills: 0, level: 1 };

        // Game objects
        this.player = null;
        this.enemies = [];
        this.level = 1;
        this.scrollX = 0;
        this.map = [];
        this.particles = [];

        // Input events
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            // Prevent scroll on arrow keys
            if(['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.reset();
        this.render();
    }

    reset() {
        this.stats = { kills: 0, level: 1 };
        this.level = 1;
        this.scrollX = 0;
        this.player = new Player(60, GAME_HEIGHT - 80);
        this.enemies = [];
        this.map = this.generateMap(32);
        this.particles = [];
        this.spawnEnemies();
    }

    generateMap(tiles) {
        // 0=air, 1=ground, 2=pit, 3=chest
        let map = [];
        let lastGround = true;
        for (let i = 0; i < tiles; ++i) {
            if (i < 2 || i > tiles-3) {
                map.push(1); // edges always ground
            } else if (Math.random() < 0.12 && lastGround) {
                map.push(2); // pit
                lastGround = false;
            } else if (Math.random() < 0.08) {
                map.push(3); // chest
                lastGround = true;
            } else {
                map.push(1);
                lastGround = true;
            }
        }
        return map;
    }

    spawnEnemies() {
        this.enemies = [];
        for (let i = 4; i < this.map.length; ++i) {
            if (this.map[i] === 1 && Math.random() < 0.25 + this.level*0.02) {
                let ex = i * 48 + 16 + Math.random()*12;
                let ey = GAME_HEIGHT - 56;
                let type = (this.level > 3 && Math.random() < 0.25) ? 'fast' : 'basic';
                this.enemies.push(new Enemy(ex, ey, type, this.level));
            }
        }
    }

    nextLevel() {
        this.level++;
        this.stats.level = Math.max(this.stats.level, this.level);
        this.map = this.generateMap(34 + this.level*2);
        this.player.x = 60;
        this.scrollX = 0;
        this.spawnEnemies();
        this.player.heal(15 + this.level*2);
        this.particles.push(new Particle(this.player.x+12, this.player.y-10, "LEVEL UP!", "#ffe066", 36));
    }

    render(now = 0) {
        if (!this.running) {
            this.drawBackground();
            this.drawMap();
            this.player && this.player.draw(this.ctx, this.scrollX);
            this.drawUI();
            return;
        }

        let dt = Math.min((now - this.lastFrame) || 17, 45) / 1000;
        this.lastFrame = now;

        // Update
        this.player.update(this, dt);

        // Enemies
        for(let enemy of this.enemies) {
            enemy.update(this, dt);
        }

        // Collisions
        this.checkCollisions();

        // Particles
        this.particles = this.particles.filter(p=>p.life>0);
        for (let p of this.particles) p.update(dt);

        // Camera scroll
        this.scrollX = Math.max(0, this.player.x - 120);

        // Draw
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBackground();
        this.drawMap();
        for(let p of this.particles) p.draw(this.ctx, this.scrollX);
        for(let enemy of this.enemies) enemy.draw(this.ctx, this.scrollX);
        this.player.draw(this.ctx, this.scrollX);
        this.drawUI();

        // Win/lose
        if (this.player.y > GAME_HEIGHT+30 || this.player.hp <= 0) {
            this.running = false;
            setTimeout(this.onGameOver, 600);
            return;
        }
        if (this.player.x > this.map.length*48 - 60) {
            this.nextLevel();
        }

        requestAnimationFrame(this.render.bind(this));
    }

    checkCollisions() {
        // Grounded
        let tileBelow = this.map[Math.floor((this.player.x+12)/48)];
        if (this.player.y + this.player.h >= GAME_HEIGHT - 40) {
            if (tileBelow === 2) {
                // Pit
                this.player.falling = true;
            } else {
                this.player.y = GAME_HEIGHT - 40 - this.player.h;
                this.player.vy = 0;
                this.player.grounded = true;
                this.player.falling = false;
            }
        } else {
            this.player.grounded = false;
        }

        // Chests
        let idx = Math.floor((this.player.x+12)/48);
        if (this.map[idx] === 3 && this.player.y + this.player.h > GAME_HEIGHT - 70) {
            this.map[idx] = 1;
            this.player.heal(10+Math.floor(Math.random()*10));
            this.particles.push(new Particle(this.player.x+12, this.player.y-10, "+HP", "#5dee44", 22));
        }

        // Enemy collisions & attacks
        for (let enemy of this.enemies) {
            if (!enemy.alive) continue;
            // Player attacks enemy
            if (this.player.attacking && Math.abs((this.player.x+14) - (enemy.x+14)) < 32 && Math.abs(this.player.y - enemy.y) < 30) {
                if (!enemy.hitThisSwing) {
                    enemy.hitThisSwing = true;
                    enemy.hp -= this.player.atk;
                    this.particles.push(new Particle(enemy.x+14, enemy.y, "-"+this.player.atk, "#ff6060", 18));
                    if (enemy.hp <= 0) {
                        enemy.alive = false;
                        this.stats.kills++;
                        this.player.gainXP(enemy.maxHp*2 + this.level*3);
                        this.particles.push(new Particle(enemy.x+14, enemy.y-12, "✖", "#fff", 25));
                    }
                }
            } 
            // Enemy hits player
            if (enemy.alive && Math.abs((this.player.x+10) - (enemy.x+14)) < 28 && Math.abs(this.player.y - enemy.y) < 26 && enemy.attackCooldown <= 0) {
                this.player.hp -= enemy.atk;
                enemy.attackCooldown = 0.6 + Math.random()*0.4;
                this.particles.push(new Particle(this.player.x+12, this.player.y-10, "-"+enemy.atk, "#e02727", 18));
            }
        }
        if (!this.player.attacking) {
            for(let e of this.enemies) e.hitThisSwing = false;
        }
    }

    drawBackground() {
        let g = this.ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        g.addColorStop(0, "#252a38");
        g.addColorStop(1, "#181c23");
        this.ctx.fillStyle = g;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Parallax hills
        for (let i = 0; i < 2; ++i) {
            let offset = this.scrollX * (0.2 + 0.09*i);
            this.ctx.save();
            this.ctx.globalAlpha = 0.13 + 0.04*i;
            this.ctx.fillStyle = i===0 ? "#5c7a92" : "#3c4e57";
            this.ctx.beginPath();
            for (let x = 0; x <= this.width; x += 16) {
                let y = Math.sin((x+offset)/160 + i*0.9)*24 + GAME_HEIGHT-120-32*i;
                this.ctx.lineTo(x, y);
            }
            this.ctx.lineTo(this.width, GAME_HEIGHT);
            this.ctx.lineTo(0, GAME_HEIGHT);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    drawMap() {
        const tileW = 48, tileH = 40;
        const startIdx = Math.max(0, Math.floor(this.scrollX / tileW) - 1);
        const endIdx = Math.min(this.map.length, Math.ceil((this.scrollX+this.width)/tileW)+1);
        for (let i = startIdx; i < endIdx; ++i) {
            let x = i * tileW - this.scrollX;
            if (this.map[i] === 1) {
                // Ground tile
                this.ctx.fillStyle = "#5d533b";
                this.ctx.fillRect(x, GAME_HEIGHT - tileH, tileW, tileH);
                this.ctx.fillStyle = "#9c8a5a";
                this.ctx.fillRect(x, GAME_HEIGHT - tileH, tileW, 14);
            } else if (this.map[i] === 2) {
                // Pit
                this.ctx.fillStyle = "#18161a";
                this.ctx.fillRect(x, GAME_HEIGHT - tileH + 15, tileW, tileH-15);
            } else if (this.map[i] === 3) {
                // Chest
                this.ctx.fillStyle = "#a06c19";
                this.ctx.fillRect(x+12, GAME_HEIGHT - tileH + 10, 24, 20);
                this.ctx.strokeStyle = "#fff8";
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x+12, GAME_HEIGHT - tileH + 10, 24, 20);
                this.ctx.fillStyle = "#deb853";
                this.ctx.fillRect(x+22, GAME_HEIGHT - tileH + 18, 4, 8);
            }
        }
    }

    drawUI() {
        // HP bar
        let hpW = 140, hpH = 14;
        this.ctx.save();
        this.ctx.globalAlpha = 0.93;
        this.ctx.fillStyle = "#232";
        this.ctx.fillRect(10, 10, hpW, hpH);
        let hpFrac = Math.max(0, this.player.hp/this.player.maxHp);
        let g = this.ctx.createLinearGradient(0,0,hpW,0);
        g.addColorStop(0, "#4efc7a");
        g.addColorStop(0.8, "#34d874");
        g.addColorStop(1, "#1c8b35");
        this.ctx.fillStyle = g;
        this.ctx.fillRect(10, 10, hpW*hpFrac, hpH);
        this.ctx.strokeStyle = "#fff8"; this.ctx.lineWidth = 2;
        this.ctx.strokeRect(10, 10, hpW, hpH);

        // XP bar
        let xpW = 110, xpH = 8;
        this.ctx.fillStyle = "#223";
        this.ctx.fillRect(10, 32, xpW, xpH);
        let xpFrac = this.player.xp / this.player.xpToLevel;
        let gg = this.ctx.createLinearGradient(0,0,xpW,0);
        gg.addColorStop(0, "#ffe066");
        gg.addColorStop(1, "#ffb534");
        this.ctx.fillStyle = gg;
        this.ctx.fillRect(10, 32, xpW*xpFrac, xpH);
        this.ctx.strokeStyle = "#fff8"; this.ctx.lineWidth = 1;
        this.ctx.strokeRect(10, 32, xpW, xpH);

        // Level/kills
        this.ctx.font = "bold 15px Segoe UI";
        this.ctx.fillStyle = "#fff";
        this.ctx.fillText(`Lv.${this.player.level}`, 10, 54);
        this.ctx.font = "13px Segoe UI";
        this.ctx.fillStyle = "#ffe066";
        this.ctx.fillText(`Kills: ${this.stats.kills}`, 90, 54);

        this.ctx.restore();
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = 28;
        this.h = 36;
        this.color = "#4eb6fc";
        this.vx = 0;
        this.vy = 0;
        this.speed = 148;
        this.jumpPower = 265;
        this.hp = 40;
        this.maxHp = 40;
        this.atk = 7;
        this.level = 1;
        this.xp = 0;
        this.xpToLevel = 32;
        this.grounded = false;
        this.falling = false;
        this.attacking = false;
        this.attackTimer = 0;
        this.dashCooldown = 0;
        this.dashing = false;
        this.dashTime = 0;
        this.facing = 1;
    }

    update(game, dt) {
        // Movement
        let keys = game.keys;
        if (this.dashing) {
            this.dashTime -= dt;
            if (this.dashTime <= 0) {
                this.dashing = false;
                this.vx = 0;
            }
        } else {
            if ((keys['arrowleft'] || keys['a']) && !this.dashing) {
                this.vx = -this.speed;
                this.facing = -1;
            } else if ((keys['arrowright'] || keys['d']) && !this.dashing) {
                this.vx = this.speed;
                this.facing = 1;
            } else {
                this.vx = 0;
            }
            // Jump
            if ((keys[' '] || keys['w'] || keys['arrowup']) && this.grounded) {
                this.vy = -this.jumpPower;
                this.grounded = false;
            }
            // Dash
            if ((keys['x'] || keys['shift']) && !this.dashing && this.dashCooldown <= 0) {
                this.dashing = true;
                this.dashTime = 0.16;
                this.vx = this.facing * 340;
                this.dashCooldown = 0.65;
            }
        }
        this.dashCooldown -= dt;
        // Attack
        if ((keys['z'] || keys['k'] || keys['j']) && !this.attacking && this.attackTimer <= 0) {
            this.attacking = true;
            this.attackTimer = 0.22;
        }
        if (this.attacking) {
            this.attackTimer -= dt;
            if(this.attackTimer <= 0) this.attacking = false;
        }
        
        // Gravity
        this.vy += 520 * dt;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        if (this.x < 0) this.x = 0;

        // Limit y
        if (this.y > GAME_HEIGHT+100) this.hp = 0;
    }

    draw(ctx, scrollX) {
        let px = this.x - scrollX;
        let py = this.y;

        // Shadow
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.beginPath();
        ctx.ellipse(px+14, py+this.h-2, 12, 6, 0, 0, 2*Math.PI);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.restore();

        // Body
        ctx.save();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(px, py, this.w, this.h, 8);
        ctx.fill();
        ctx.stroke();

        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px+8, py+14, 3, 0, 2*Math.PI);
        ctx.arc(px+20, py+14, 3, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillStyle = "#232";
        ctx.beginPath();
        ctx.arc(px+8, py+14, 1.5, 0, 2*Math.PI);
        ctx.arc(px+20, py+14, 1.5, 0, 2*Math.PI);
        ctx.fill();

        // Arms
        ctx.strokeStyle = "#7fc7ff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px+6, py+18);
        ctx.lineTo(px-2, py+26 + (this.attacking?Math.sin(Date.now()/60)*8:0));
        ctx.moveTo(px+22, py+18);
        ctx.lineTo(px+30, py+26 + (this.attacking?Math.sin(Date.now()/60)*8:0));
        ctx.stroke();

        // Sword swing (attack)
        if (this.attacking) {
            ctx.save();
            ctx.translate(px+14 + 14*this.facing, py+20);
            ctx.rotate(this.facing * (Math.PI/3) * Math.max(0, 1-this.attackTimer*5));
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();
            ctx.restore();
        }

        // Dashing effect
        if (this.dashing) {
            ctx.save();
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = "#b4e7ff";
            ctx.beginPath();
            ctx.arc(px+14-10*this.facing, py+22, 16, 0, 2*Math.PI);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    gainXP(xp) {
        this.xp += xp;
        while(this.xp >= this.xpToLevel) {
            this.xp -= this.xpToLevel;
            this.level++;
            this.maxHp += 8;
            this.hp += 8;
            this.atk = Math.floor(this.atk*1.12)+1;
            this.xpToLevel = Math.floor(this.xpToLevel*1.15 + 18);
        }
    }

    heal(hp) {
        this.hp = Math.min(this.maxHp, this.hp + hp);
    }
}

class Enemy {
    constructor(x, y, type, level) {
        this.x = x;
        this.y = y;
        this.w = 26;
        this.h = 32;
        this.type = type;
        this.level = Math.max(1, level + Math.floor(Math.random()*2) - 1);
        this.facing = 1;
        this.vx = 0;
        this.vy = 0;
        this.speed = type === "fast" ? 75 + level*3 : 45 + level*2;
        this.maxHp = type === "fast" ? 18 + level*3 : 26 + level*4;
        this.hp = this.maxHp;
        this.atk = type === "fast" ? 4 + level : 6 + level;
        this.alive = true;
        this.attackCooldown = 0;
        this.hitThisSwing = false;
    }

    update(game, dt) {
        if (!this.alive) return;
        let dx = game.player.x - this.x;
        this.facing = dx > 0 ? 1 : -1;
        if (Math.abs(dx) < 120) {
            this.vx = Math.sign(dx) * this.speed;
        } else {
            this.vx = 0;
        }
        this.x += this.vx * dt;
        this.attackCooldown -= dt;
        // Gravity
        if (this.y + this.h < GAME_HEIGHT - 40) {
            this.vy += 500*dt;
            this.y += this.vy*dt;
        } else {
            this.y = GAME_HEIGHT - 40 - this.h;
            this.vy = 0;
        }
    }
    
    draw(ctx, scrollX) {
        if (!this.alive) return;
        let px = this.x - scrollX;
        let py = this.y;

        // Shadow
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.ellipse(px+13, py+this.h-3, 10, 5, 0, 0, 2*Math.PI);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.restore();

        // Body
        ctx.save();
        ctx.strokeStyle = "#2b2222";
        ctx.lineWidth = 2;
        ctx.fillStyle = this.type==="fast" ? "#ed4747" : "#c69c4b";
        ctx.beginPath();
        ctx.roundRect(px, py, this.w, this.h, 6);
        ctx.fill();
        ctx.stroke();

        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px+8, py+12, 2.3, 0, 2*Math.PI);
        ctx.arc(px+18, py+12, 2.3, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillStyle = "#a22";
        ctx.beginPath();
        ctx.arc(px+8, py+12, 1, 0, 2*Math.PI);
        ctx.arc(px+18, py+12, 1, 0, 2*Math.PI);
        ctx.fill();

        // Arms
        ctx.strokeStyle = "#b67c3b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px+6, py+16);
        ctx.lineTo(px-2, py+24);
        ctx.moveTo(px+20, py+16);
        ctx.lineTo(px+28, py+24);
        ctx.stroke();

        ctx.restore();

        // HP bar
        let frac = Math.max(0, this.hp/this.maxHp);
        ctx.fillStyle = "#ff5050";
        ctx.fillRect(px, py-8, this.w*frac, 4);
        ctx.strokeStyle = "#fff9";
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py-8, this.w, 4);
    }
}

class Particle {
    constructor(x, y, text, color, size) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color || "#fff";
        this.size = size || 16;
        this.life = 0.9;
        this.vy = -28 - Math.random()*8;
    }
    update(dt) {
        this.y += this.vy*dt;
        this.vy += 28*dt;
        this.life -= dt;
    }
    draw(ctx, scrollX) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.font = `bold ${this.size}px Segoe UI`;
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.x - scrollX - this.size/2, this.y);
        ctx.restore();
    }
}
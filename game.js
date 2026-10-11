const GAME_WIDTH = 640;
const GAME_HEIGHT = 360;
const FRAME = 32;
const SLASH_FRAME = 32;
const MAX_HP = 15;
const BASE_DAMAGE = 5;
const GRAVITY = 933;
const JUMP_SPEED = -283;
const SWING_MS = 200;
const ATTACK_RADIUS = FRAME;
const MAX_JUMPS = 2;                 // Ground jump + one midair jump.
const GLIDE_MS = 550;                // Slow fall continues briefly after the swing.
const GLIDE_GRAVITY = 220;           // Less gravity while falling after a strike.
const GLIDE_TERMINAL_SPEED = 70;    // Limit downward speed (pixels/second).

// Level arrays: [centerX, centerY, width, height].
// The first level is the original layout. Two new levels unlock after it.
const LEVELS = [
  {
    name: 'THE OUTSKIRTS',
    background: '#19253a',
    platformColor: 0x43566e,
    spawn: [67, 293],
    platforms: [
      [320, 347, 640, 27],
      [140, 273, 147, 13],
      [353, 227, 160, 13],
      [537, 173, 120, 13]
    ],
    enemies: [[233, 293], [407, 193], [540, 140]]
  },
  {
    name: 'THE ROOTED PASS',
    background: '#18352f',
    platformColor: 0x547b61,
    spawn: [63, 297],
    platforms: [
      [320, 347, 640, 27],
      [133, 287, 120, 13],
      [270, 233, 117, 13],
      [417, 203, 123, 13],
      [547, 270, 113, 13],
      [550, 150, 110, 13]
    ],
    enemies: [[163, 257], [277, 207], [417, 177], [553, 243]]
  },
  {
    name: 'THE IRON SPIRE',
    background: '#32243f',
    platformColor: 0x80647d,
    spawn: [63, 300],
    platforms: [
      [320, 347, 640, 27],
      [117, 287, 117, 13],
      [243, 237, 107, 13],
      [380, 190, 113, 13],
      [530, 243, 123, 13],
      [557, 137, 107, 13],
      [207, 150, 100, 13]
    ],
    enemies: [[137, 260], [250, 210], [380, 163], [523, 217], [557, 110]]
  }
];

class Level extends Phaser.Scene {
  constructor() {
    super('Level');
  }

  init(data = {}) {
    // Pass { levelIndex: 1 } or { levelIndex: 2 } when restarting the scene.
    const requested = Number.isInteger(data.levelIndex) ? data.levelIndex : 0;
    this.levelIndex = Math.max(0, Math.min(requested, LEVELS.length - 1));
  }

  preload() {
    // Transparent sprite sheets: frames laid out left-to-right in one row.
    this.load.spritesheet('player_idle', 'assets/player_idle.png', { frameWidth: FRAME, frameHeight: FRAME });
    this.load.spritesheet('player_run', 'assets/player_run.png', { frameWidth: FRAME, frameHeight: FRAME });
    this.load.spritesheet('player_jump', 'assets/player_jump.png', { frameWidth: FRAME, frameHeight: FRAME });
    this.load.spritesheet('player_fall', 'assets/player_fall.png', { frameWidth: FRAME, frameHeight: FRAME });
    this.load.spritesheet('enemy_idle', 'assets/enemy_idle.png', { frameWidth: FRAME, frameHeight: FRAME });
    this.load.spritesheet('enemy_walk', 'assets/enemy_walk.png', { frameWidth: FRAME, frameHeight: FRAME });
    // Each 96x96 frame uses the BOTTOM CENTER (48, 96) as the attack origin.
    this.load.spritesheet('axe_slash', 'assets/axe_slash.png', { frameWidth: SLASH_FRAME, frameHeight: SLASH_FRAME });
  }

  create() {
    if (!Number.isInteger(this.levelIndex)) this.levelIndex = 0;
    const level = LEVELS[this.levelIndex];
    this.cameras.main.setBackgroundColor(level.background);


    const createAnimation = config => {
      if (!this.anims.exists(config.key)) this.anims.create(config);
    };
    createAnimation({ key: 'hero-idle', frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 3 }), frameRate: 5, repeat: -1 });
    createAnimation({ key: 'hero-run', frames: this.anims.generateFrameNumbers('player_run', { start: 0, end: 5 }), frameRate: 12, repeat: -1 });
    createAnimation({ key: 'hero-jump', frames: [{ key: 'player_jump', frame: 0 }], frameRate: 1 });
    createAnimation({ key: 'hero-fall', frames: [{ key: 'player_fall', frame: 0 }], frameRate: 1 });
    createAnimation({ key: 'enemy-idle', frames: this.anims.generateFrameNumbers('enemy_idle', { start: 0, end: 3 }), frameRate: 4, repeat: -1 });
    createAnimation({ key: 'enemy-walk', frames: this.anims.generateFrameNumbers('enemy_walk', { start: 0, end: 5 }), frameRate: 9, repeat: -1 });
    // 6 slash frames × 30 FPS = 200ms swing, synchronized with damage detection.
    createAnimation({ key: 'axe-attack', frames: this.anims.generateFrameNumbers('axe_slash', { start: 0, end: 5 }), frameRate: 30, repeat: 0 });

    this.platforms = this.physics.add.staticGroup();
    level.platforms.forEach(([x, y, w, h]) => {
      const platform = this.add.rectangle(x, y, w, h, level.platformColor);
      this.physics.add.existing(platform, true);
      this.platforms.add(platform);
    });

    this.player = this.physics.add.sprite(...level.spawn, 'player_idle');
    this.player.setCollideWorldBounds(true).setSize(17, 26).setOffset(7, 6);
    this.player.body.setGravityY(GRAVITY);
    this.player.play('hero-idle');
    this.physics.add.collider(this.player, this.platforms);

    this.enemies = this.physics.add.group();
    level.enemies.forEach(([x, y]) => {
      const enemy = this.enemies.create(x, y, 'enemy_idle');
      enemy.setSize(20, 24).setOffset(6, 8);
      enemy.setCollideWorldBounds(true);
      enemy.body.setGravityY(GRAVITY);
      enemy.hp = MAX_HP;
      enemy.lastSwingHit = -1;
      enemy.setData('spawnX', x);
      enemy.setVelocityX(-23);
      enemy.play('enemy-walk');
      enemy.hpBarBack = this.add.rectangle(x, y - 23, 25, 3, 0x241f2c).setDepth(7);
      enemy.hpBarFill = this.add.rectangle(x - 12, y - 23, 24, 2, 0xed676a).setOrigin(0, 0.5).setDepth(8);
    });
    this.physics.add.collider(this.enemies, this.platforms);

    this.keys = this.input.keyboard.addKeys('A,D,SPACE,J,R,H');
    this.facing = 1;
    this.jumpsUsed = 0;
    this.glideUntil = 0;
    this.hp = MAX_HP;
    this.attacking = false;
    this.swingId = 0;
    this.fallingStrike = false;
    this.attackDamage = BASE_DAMAGE;
    this.won = false;
    this.gameOver = false;
    this.debugHitboxes = new URLSearchParams(location.search).has('debug');
    this.debugGfx = this.add.graphics().setDepth(12);

    // The actual attack is a PNG animation, not a drawn line or triangle.
    this.slash = this.add.sprite(0, 0, 'axe_slash').setOrigin(0.5, 1).setScale(2).setDepth(6).setVisible(false);
    this.slash.on('animationcomplete-axe-attack', () => this.slash.setVisible(false));

    this.status = this.add.text(10, 10, '', { font: '12px monospace', color: '#ffffff' }).setDepth(20);
    this.help = this.add.text(10, 30, 'A/D Move    SPACE Double Jump    J Attack    H Hitboxes    R Retry', { font: '9px monospace', color: '#bccbe3' }).setDepth(20);
    this.message = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 23, '', { font: '21px monospace', color: '#ffe5ae', align: 'center' }).setOrigin(0.5).setDepth(20);
    this.levelTitle = this.add.text(GAME_WIDTH - 9, 53, `LEVEL ${this.levelIndex + 1}/${LEVELS.length}: ${level.name}`, {
      font: '11px monospace', color: '#f2dd9f'
    }).setOrigin(1, 0).setDepth(20);

    this.physics.add.overlap(this.player, this.enemies, (player, enemy) => {
      // Bodies may still be referenced by physics during a defeat frame.
      if (!enemy || !enemy.active || enemy.hp <= 0 || this.gameOver || this.won) return;
      if (this.time.now < (player.getData('invulnerableUntil') || 0)) return;
      this.hp = Math.max(0, this.hp - BASE_DAMAGE);
      player.setData('invulnerableUntil', this.time.now + 900);
      player.setTint(0xff7777);
      this.time.delayedCall(180, () => { if (player.active) player.clearTint(); });
      if (this.hp === 0) {
        this.gameOver = true;
        player.setVelocity(0, 0);
        this.message.setText('GAME OVER\nPress R to retry');
      }
    });

    this.updateHud();
  }

  liveEnemies() {

    return this.enemies.getChildren().filter(enemy => enemy && enemy.active && enemy.hp > 0);
  }

  startSwing() {
    if (this.attacking || this.gameOver || this.won) return;
    this.attacking = true;
    this.swingId += 1;
    this.swingStart = this.time.now;
    this.swingFacing = this.facing; // Lock attack direction until swing ends.
    this.fallingStrike = !this.player.body.blocked.down && this.player.body.velocity.y > 0;
    this.attackDamage = this.fallingStrike ? BASE_DAMAGE * 2 : BASE_DAMAGE;
    if (this.fallingStrike) {
      this.glideUntil = this.time.now + GLIDE_MS;
      this.updateFallPhysics(this.time.now);
    }
    this.slash.setVisible(true).setFlipX(this.swingFacing < 0);
    this.slash.setTint(this.fallingStrike ? 0xffd16e : 0xffffff);
    this.slash.play('axe-attack', true);
    this.moveSlashToPlayer();
  }

  // Allows the player to jump twice in mid-air after each landing
  tryJump() {
    if (this.player.body.blocked.down) this.jumpsUsed = 0;
    if (this.jumpsUsed >= MAX_JUMPS) return false;
    this.jumpsUsed++;
    this.glideUntil = 0; // A second jump cancels a falling strike's slow-fall.
    this.player.body.setGravityY(GRAVITY);
    this.player.setVelocityY(JUMP_SPEED);
    return true;
  }

  updateFallPhysics(time) {
    const body = this.player.body;
    if (body.blocked.down) {
      this.glideUntil = 0;
      body.setGravityY(GRAVITY);
      return;
    }
    if (time < this.glideUntil && body.velocity.y >= 0) {
      body.setGravityY(GLIDE_GRAVITY);
      if (body.velocity.y > GLIDE_TERMINAL_SPEED) {
        this.player.setVelocityY(GLIDE_TERMINAL_SPEED);
      }
    } else {
      body.setGravityY(GRAVITY);
    }
  }

    // Finishing a level automatically loads the next; the third level ends the game.
  completeLevel() {
    if (this.won) return;
    this.won = true;
    this.slash.setVisible(false);
    this.player.setVelocityX(0);
    if (this.levelIndex === LEVELS.length - 1) {
      this.message.setText('ALL 3 LEVELS COMPLETE!\nPress R to replay');
      return;
    }
    this.message.setText(`LEVEL ${this.levelIndex + 1} CLEAR!\nNext level...`);
    this.time.delayedCall(1200, () => {
      if (this.scene.isActive()) this.scene.restart({ levelIndex: this.levelIndex + 1 });
    });
  }

  moveSlashToPlayer() {
    // PNG's bottom-center origin is exactly aligned with the player's feet.
    this.slash.setPosition(this.player.x, this.player.body.bottom);
  }

  // Whether the enemy's RECTANGULAR physics body intersects the current arc.
  hitboxIntersectsSwing(body, progress) {
    if (!body || !body.enable) return false;
    const cx = this.player.x;
    const cy = this.player.body.bottom;
    const r2 = ATTACK_RADIUS * ATTACK_RADIUS;

    for (let ix = 0; ix <= 8; ix++) {
      for (let iy = 0; iy <= 8; iy++) {
        const x = body.left + body.width * ix / 8;
        const y = body.top + body.height * iy / 8;
        const dx = (x - cx) * this.swingFacing;
        const dy = y - cy;
        if (dx < 0 || dy > 0 || dx * dx + dy * dy > r2) continue;
        const angle = Math.atan2(-dy, dx); // 0 = forward, PI/2 = up.
        const sweepPoint = 1 - angle / (Math.PI / 2);
        if (sweepPoint >= progress - 0.30 && sweepPoint <= progress + 0.20) return true;
      }
    }
    return false;
  }

  damageEnemy(enemy) {
    if (!enemy.active || enemy.hp <= 0 || enemy.lastSwingHit === this.swingId) return false;
    enemy.lastSwingHit = this.swingId;
    enemy.hp = Math.max(0, enemy.hp - this.attackDamage);
    if (enemy.hp === 0) {
      // Mark dead and disable physics immediately. Destroy AFTER the collision
      // loop; destroying inside children.iterate() was causing the freeze.
      enemy.disableBody(true, true);
      return true;
    }
    enemy.setTint(this.fallingStrike ? 0xffbb55 : 0xffdddd);
    this.time.delayedCall(100, () => { if (enemy.active) enemy.clearTint(); });
    enemy.setVelocityX(this.swingFacing * 140);
    enemy.setVelocityY(-87);
    return false;
  }

  removeDefeatedEnemy(enemy) {

    if (enemy.hpBarBack) { enemy.hpBarBack.destroy(); enemy.hpBarBack = null; }
    if (enemy.hpBarFill) { enemy.hpBarFill.destroy(); enemy.hpBarFill = null; }
    this.enemies.remove(enemy, true, true); // Remove from group, destroy sprite/body.
  }

  updateHud() {
    const remaining = this.liveEnemies().length;
    const slowFall = this.glideUntil > this.time.now && !this.player.body.blocked.down;
    this.status.setText(`HP: ${this.hp}/${MAX_HP}   Enemies: ${remaining}   Jumps: ${MAX_JUMPS - this.jumpsUsed}/${MAX_JUMPS}   Spell: ${BASE_DAMAGE} / ${BASE_DAMAGE * 2}${slowFall ? '   SLOW FALL!' : ''}`);
  }

  update(time) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {

      const restartLevel = this.won && this.levelIndex === LEVELS.length - 1 ? 0 : this.levelIndex;
      this.scene.restart({ levelIndex: restartLevel });
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.H)) this.debugHitboxes = !this.debugHitboxes;
    if (this.gameOver || this.won) {
      this.debugGfx.clear();
      this.updateHud();
      return;
    }

    const player = this.player;
    let vx = 0;
    if (this.keys.A.isDown) vx -= 127;
    if (this.keys.D.isDown) vx += 127;
    player.setVelocityX(vx);
    if (vx !== 0) this.facing = Math.sign(vx);
    player.setFlipX(this.facing < 0);
    if (player.body.blocked.down) this.jumpsUsed = 0;
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryJump();
    if (Phaser.Input.Keyboard.JustDown(this.keys.J)) this.startSwing();
    this.updateFallPhysics(time);

    if (!player.body.blocked.down) {
      player.play(player.body.velocity.y < 0 ? 'hero-jump' : 'hero-fall', true);
    } else {
      player.play(vx === 0 ? 'hero-idle' : 'hero-run', true);
    }

    const enemies = this.liveEnemies(); // Immutable snapshot for this frame.
    for (const enemy of enemies) {
      const dx = player.x - enemy.x;
      if (Math.abs(dx) < 127) enemy.setVelocityX(Math.sign(dx) * 43);
      else if (Math.abs(enemy.x - enemy.getData('spawnX')) > 57) enemy.setVelocityX(Math.sign(enemy.getData('spawnX') - enemy.x) * 23);
      else if (enemy.body.velocity.x === 0) enemy.setVelocityX(-23);
      enemy.setFlipX(enemy.body.velocity.x > 0);
      enemy.play(Math.abs(enemy.body.velocity.x) < 3 ? 'enemy-idle' : 'enemy-walk', true);
      enemy.hpBarBack.setPosition(enemy.x, enemy.body.top - 7);
      enemy.hpBarFill.setPosition(enemy.x - 12, enemy.body.top - 7);
      enemy.hpBarFill.width = 24 * enemy.hp / MAX_HP;
    }

    if (this.attacking) {
      this.moveSlashToPlayer();
      const progress = (time - this.swingStart) / SWING_MS;
      if (progress >= 1) {
        this.attacking = false;
        this.slash.setVisible(false);
      } else if (progress >= 0.16 && progress <= 0.84) {
        const defeated = [];
        for (const enemy of enemies) {
          if (enemy.lastSwingHit !== this.swingId && this.hitboxIntersectsSwing(enemy.body, progress)) {
            if (this.damageEnemy(enemy)) defeated.push(enemy);
          }
        }
        // Safely remove after all hits: no mutation during enemy iteration.
        for (const enemy of defeated) this.removeDefeatedEnemy(enemy);
      }
    }

    this.debugGfx.clear();
    if (this.debugHitboxes) {
      const g = this.debugGfx;
      g.lineStyle(1.5, 0x49f2c2);
      for (const enemy of this.liveEnemies()) g.strokeRect(enemy.body.left, enemy.body.top, enemy.body.width, enemy.body.height);
      g.strokeRect(player.body.left, player.body.top, player.body.width, player.body.height);
      if (this.attacking) {
        const cx = player.x, cy = player.body.bottom;
        g.lineStyle(2, 0xffd066, 0.8);
        g.beginPath();
        g.arc(cx, cy, ATTACK_RADIUS, this.swingFacing < 0 ? Math.PI : -Math.PI / 2, this.swingFacing < 0 ? Math.PI * 1.5 : 0, false);
        g.strokePath();
      }
    }

    this.updateHud();
    if (this.liveEnemies().length === 0) this.completeLevel();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#19253a',
  pixelArt: true, // Crisp pixel-art sprite sheets when scaled.
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: [Level],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

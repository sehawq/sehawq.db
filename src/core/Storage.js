/**
 * Storage Layer - Handles all file I/O with performance optimizations
 * 
 * Because reading/writing files should be fast, not frustrating
 * Added some tricks I learned the hard way 🎯
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class Storage {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = {
      compression: false,
      backupOnWrite: true,
      backupRetention: 5, // Keep last 5 backups
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      ...options
    };

    this.writeQueue = [];
    this.isWriting = false;
    this.stats = {
      reads: 0,
      writes: 0,
      backups: 0,
      errors: 0,
      totalReadTime: 0,
      totalWriteTime: 0
    };

    this._ensureDirectory();
  }

  /**
   * Make sure the directory exists
   * Learned this the hard way - files don't create their own folders! 😅
   */
  async _ensureDirectory() {
    const dir = path.dirname(this.filePath);
    try {
      await fs.access(dir);
    } catch (error) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Read data with performance tracking and caching
   */
  async read() {
    const startTime = performance.now();
    
    try {
      // Check if file exists first
      try {
        await fs.access(this.filePath);
      } catch (error) {
        // File doesn't exist - return empty data
        return {};
      }

      const data = await fs.readFile(this.filePath, 'utf8');
      
      // Performance tracking
      const readTime = performance.now() - startTime;
      this.stats.reads++;
      this.stats.totalReadTime += readTime;

      if (this.options.debug) {
        console.log(`📖 Read ${data.length} bytes in ${readTime.toFixed(2)}ms`);
      }

      return JSON.parse(data);
    } catch (error) {
      this.stats.errors++;
      console.error('🚨 Storage read error:', error);
      
      // Try to recover from backup if main file is corrupted
      return await this._recoverFromBackup();
    }
  }

  /**
   * Write data with queuing and atomic operations
   * Prevents corruption and handles concurrent writes
   */
  async write(data) {
    return new Promise((resolve, reject) => {
      // Queue the write operation
      this.writeQueue.push({ data, resolve, reject });
      
      if (!this.isWriting) {
        this._processWriteQueue();
      }
    });
  }

  /**
   * Process write queue one by one
   * Prevents race conditions and file corruption
   */
  async _processWriteQueue() {
    if (this.writeQueue.length === 0 || this.isWriting) {
      return;
    }

    this.isWriting = true;
    const startTime = performance.now();

    try {
      const { data, resolve, reject } = this.writeQueue.shift();

      // Check file size limit
      const dataSize = Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (dataSize > this.options.maxFileSize) {
        throw new Error(`File size limit exceeded: ${dataSize} > ${this.options.maxFileSize}`);
      }

      // Create backup before writing
      if (this.options.backupOnWrite) {
        await this._createBackup();
      }

      // Atomic write - write to temp file then rename
      const tempPath = this.filePath + '.tmp';
      const serializedData = JSON.stringify(data, null, 2);
      
      await fs.writeFile(tempPath, serializedData, 'utf8');
      await fs.rename(tempPath, this.filePath);

      // Performance tracking
      const writeTime = performance.now() - startTime;
      this.stats.writes++;
      this.stats.totalWriteTime += writeTime;

      if (this.options.debug) {
        console.log(`💾 Written ${serializedData.length} bytes in ${writeTime.toFixed(2)}ms`);
      }

      resolve();
    } catch (error) {
      this.stats.errors++;
      console.error('🚨 Storage write error:', error);
      this.writeQueue[0]?.reject(error);
    } finally {
      this.isWriting = false;
      
      // Process next item in queue
      if (this.writeQueue.length > 0) {
        setImmediate(() => this._processWriteQueue());
      }
    }
  }

  /**
   * Create backup of current data file
   * Saved my data more times than I can count! 💾
   */
  async _createBackup() {
    try {
      // Check if source file exists
      try {
        await fs.access(this.filePath);
      } catch (error) {
        // No file to backup - that's fine
        return;
      }

      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
      
      const backupPath = `${this.filePath}.backup_${timestamp}`;
      
      await fs.copyFile(this.filePath, backupPath);
      this.stats.backups++;

      // Clean up old backups
      await this._cleanupOldBackups();

      if (this.options.debug) {
        console.log(`🔐 Backup created: ${backupPath}`);
      }
    } catch (error) {
      console.error('🚨 Backup creation failed:', error);
      // Don't throw - backup failure shouldn't block main write
    }
  }

  /**
   * Keep only the most recent backups
   */
  async _cleanupOldBackups() {
    try {
      const dir = path.dirname(this.filePath);
      const fileName = path.basename(this.filePath);
      
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(fileName + '.backup_'))
        .sort()
        .reverse();

      // Remove old backups beyond retention limit
      for (const file of backupFiles.slice(this.options.backupRetention)) {
        await fs.unlink(path.join(dir, file));
        
        if (this.options.debug) {
          console.log(`🗑️  Cleaned up old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('🚨 Backup cleanup failed:', error);
    }
  }

  /**
   * Try to recover data from backup if main file is corrupted
   */
  async _recoverFromBackup() {
    try {
      const dir = path.dirname(this.filePath);
      const fileName = path.basename(this.filePath);
      
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(fileName + '.backup_'))
        .sort()
        .reverse();

      for (const backupFile of backupFiles) {
        try {
          const backupPath = path.join(dir, backupFile);
          const data = await fs.readFile(backupPath, 'utf8');
          const parsed = JSON.parse(data);
          
          console.log(`🔧 Recovered data from backup: ${backupFile}`);
          
          // Restore the backup to main file
          await this.write(parsed);
          
          return parsed;
        } catch (error) {
          // This backup is also corrupted, try next one
          continue;
        }
      }
      
      throw new Error('No valid backup found for recovery');
    } catch (error) {
      console.error('🚨 Recovery from backup failed:', error);
      return {}; // Return empty data as last resort
    }
  }

  /**
   * Get storage statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgReadTime: this.stats.reads > 0 
        ? (this.stats.totalReadTime / this.stats.reads).toFixed(2) + 'ms'
        : '0ms',
      avgWriteTime: this.stats.writes > 0 
        ? (this.stats.totalWriteTime / this.stats.writes).toFixed(2) + 'ms'
        : '0ms',
      queueLength: this.writeQueue.length,
      isWriting: this.isWriting
    };
  }

  /**
   * Manual backup creation
   */
  async createBackup() {
    return await this._createBackup();
  }

  /**
   * Get list of available backups
   */
  async listBackups() {
    try {
      const dir = path.dirname(this.filePath);
      const fileName = path.basename(this.filePath);
      
      const files = await fs.readdir(dir);
      return files
        .filter(file => file.startsWith(fileName + '.backup_'))
        .sort()
        .reverse();
    } catch (error) {
      return [];
    }
  }

  /**
   * Restore from specific backup
   */
  async restoreBackup(backupName) {
    const backupPath = path.join(path.dirname(this.filePath), backupName);
    
    try {
      const data = await fs.readFile(backupPath, 'utf8');
      const parsed = JSON.parse(data);
      
      await this.write(parsed);
      console.log(`✅ Restored from backup: ${backupName}`);
      
      return parsed;
    } catch (error) {
      throw new Error(`Failed to restore backup ${backupName}: ${error.message}`);
    }
  }
}

module.exports = Storage;
/**
 * Persistence Layer - Handles data storage and retrieval 💾
 * 
 * The bridge between memory and permanent storage
 * Because RAM is great, but it forgets everything when you blink
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class Persistence {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = {
      autoSave: true,
      saveInterval: 5000,
      compression: false,
      encryption: false,
      encryptionKey: null,
      ...options
    };

    this.data = new Map();
    this.isSaving = false;
    this.saveQueue = [];
    this.stats = {
      reads: 0,
      writes: 0,
      saves: 0,
      loads: 0,
      errors: 0
    };

    this._ensureDirectory();
  }

  /**
   * Ensure data directory exists
   */
  async _ensureDirectory() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.access(dir);
    } catch (error) {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    }
  }

  /**
   * Load data from storage
   */
  async load() {
    const startTime = performance.now();
    this.stats.loads++;

    try {
      // Check if file exists
      try {
        await fs.access(this.filePath);
      } catch (error) {
        // File doesn't exist - start with empty data
        this.data.clear();
        return new Map();
      }

      // Read and parse data
      const fileData = await fs.readFile(this.filePath, 'utf8');
      
      let parsedData;
      if (this.options.compression) {
        parsedData = await this._decompress(fileData);
      } else if (this.options.encryption) {
        parsedData = await this._decrypt(fileData);
      } else {
        parsedData = JSON.parse(fileData);
      }

      // Convert to Map
      this.data.clear();
      for (const [key, value] of Object.entries(parsedData)) {
        this.data.set(key, value);
      }

      const loadTime = performance.now() - startTime;
      
      if (this.options.debug) {
        console.log(`📁 Loaded ${this.data.size} records in ${loadTime.toFixed(2)}ms`);
      }

      return this.data;
    } catch (error) {
      this.stats.errors++;
      console.error('🚨 Persistence load error:', error);
      
      // Try to recover from backup
      return await this._recoverFromBackup();
    }
  }

  /**
   * Save data to storage
   */
  async save(data = null) {
    if (this.isSaving) {
      // Queue the save request
      return new Promise((resolve, reject) => {
        this.saveQueue.push({ data, resolve, reject });
      });
    }

    this.isSaving = true;
    const startTime = performance.now();
    this.stats.saves++;

    try {
      const saveData = data || this.data;
      
      // Convert Map to object for JSON serialization
      const serializableData = Object.fromEntries(saveData);

      let dataToSave;
      if (this.options.compression) {
        dataToSave = await this._compress(serializableData);
      } else if (this.options.encryption) {
        dataToSave = await this._encrypt(serializableData);
      } else {
        dataToSave = JSON.stringify(serializableData, null, 2);
      }

      // Atomic write: write to temp file then rename
      const tempPath = this.filePath + '.tmp';
      await fs.writeFile(tempPath, dataToSave, 'utf8');
      await fs.rename(tempPath, this.filePath);

      const saveTime = performance.now() - startTime;
      
      if (this.options.debug) {
        console.log(`💾 Saved ${saveData.size} records in ${saveTime.toFixed(2)}ms`);
      }

      this.stats.writes++;
      return true;
    } catch (error) {
      this.stats.errors++;
      console.error('🚨 Persistence save error:', error);
      throw error;
    } finally {
      this.isSaving = false;
      
      // Process next item in queue
      if (this.saveQueue.length > 0) {
        const next = this.saveQueue.shift();
        this.save(next.data)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }

  /**
   * Set value in persistence
   */
  async set(key, value) {
    this.data.set(key, value);
    
    if (this.options.autoSave) {
      await this.save();
    }
    
    return true;
  }

  /**
   * Get value from persistence
   */
  async get(key) {
    this.stats.reads++;
    return this.data.get(key);
  }

  /**
   * Delete value from persistence
   */
  async delete(key) {
    const deleted = this.data.delete(key);
    
    if (deleted && this.options.autoSave) {
      await this.save();
    }
    
    return deleted;
  }

  /**
   * Check if key exists
   */
  async has(key) {
    return this.data.has(key);
  }

  /**
   * Get all data
   */
  async getAll() {
    return new Map(this.data);
  }

  /**
   * Clear all data
   */
  async clear() {
    this.data.clear();
    
    if (this.options.autoSave) {
      await this.save();
    }
    
    return true;
  }

  /**
   * Compression methods (placeholder - would use zlib in real implementation)
   */
  async _compress(data) {
    // In a real implementation, this would use zlib or similar
    // For now, just return stringified data
    return JSON.stringify(data);
  }

  async _decompress(data) {
    // In a real implementation, this would decompress
    // For now, just parse JSON
    return JSON.parse(data);
  }

  /**
   * Encryption methods (placeholder)
   */
  async _encrypt(data) {
    if (!this.options.encryptionKey) {
      throw new Error('Encryption key required for encryption');
    }
    
    // In a real implementation, this would use crypto
    // For now, just return stringified data
    return JSON.stringify(data);
  }

  async _decrypt(data) {
    if (!this.options.encryptionKey) {
      throw new Error('Encryption key required for decryption');
    }
    
    // In a real implementation, this would decrypt
    // For now, just parse JSON
    return JSON.parse(data);
  }

  /**
   * Backup and recovery
   */
  async backup(backupPath = null) {
    const path = backupPath || `${this.filePath}.backup_${Date.now()}`;
    
    try {
      await this.save();
      await fs.copyFile(this.filePath, path);
      
      if (this.options.debug) {
        console.log(`💾 Backup created: ${path}`);
      }
      
      return path;
    } catch (error) {
      console.error('🚨 Backup failed:', error);
      throw error;
    }
  }

  async _recoverFromBackup() {
    try {
      const dir = path.dirname(this.filePath);
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(path.basename(this.filePath) + '.backup_'))
        .sort()
        .reverse();

      for (const backupFile of backupFiles) {
        try {
          const backupPath = path.join(dir, backupFile);
          await fs.copyFile(backupPath, this.filePath);
          
          console.log(`🔧 Recovered from backup: ${backupFile}`);
          return await this.load();
        } catch (error) {
          // Try next backup
          continue;
        }
      }
      
      throw new Error('No valid backup found');
    } catch (error) {
      console.error('🚨 Recovery failed:', error);
      // Return empty data as last resort
      this.data.clear();
      return new Map();
    }
  }

  /**
   * Get persistence statistics
   */
  getStats() {
    return {
      ...this.stats,
      dataSize: this.data.size,
      filePath: this.filePath,
      isSaving: this.isSaving,
      queueLength: this.saveQueue.length
    };
  }

  /**
   * Start auto-save interval
   */
  startAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      if (this.data.size > 0) {
        this.save().catch(error => {
          console.error('🚨 Auto-save failed:', error);
        });
      }
    }, this.options.saveInterval);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Close persistence (cleanup)
   */
  async close() {
    this.stopAutoSave();
    
    // Process remaining save queue
    while (this.saveQueue.length > 0) {
      const { data, resolve, reject } = this.saveQueue.shift();
      try {
        await this.save(data);
        resolve();
      } catch (error) {
        reject(error);
      }
    }
    
    // Final save
    if (this.data.size > 0) {
      await this.save();
    }
  }
}

module.exports = Persistence;
# Raspberry Pi Image Documentation Index

## 🚀 Getting Started

**Start here if you're new:**

1. **[GETTING_STARTED.md](GETTING_STARTED.md)** - Complete guide with step-by-step instructions
   - Prerequisites
   - Dev image setup (auto-update)
   - Pre-built image setup (flash and go)
   - Troubleshooting
   - Quick reference

2. **[QUICK_START_DEV.md](QUICK_START_DEV.md)** - Dev image quick start
   - Fast setup for development/testing
   - Auto-updates from GitHub

3. **[QUICK_START_PREBUILT.md](QUICK_START_PREBUILT.md)** - Pre-built image quick start
   - Fast setup for production
   - Flash and go

## 📚 Detailed Documentation

### Setup Guides

- **[FLASH_DEV_IMAGE.md](FLASH_DEV_IMAGE.md)** - Detailed dev image flashing guide
- **[PREBUILT_IMAGE.md](PREBUILT_IMAGE.md)** - Pre-built image creation guide
- **[HOW_IT_WORKS.md](HOW_IT_WORKS.md)** - How the image setup process works

### Testing

- **[TESTING.md](TESTING.md)** - Testing and validation
- **[validate.ps1](validate.ps1)** - Validation script
- **[test-bash-syntax.ps1](test-bash-syntax.ps1)** - Bash syntax testing
- **[test-all.ps1](test-all.ps1)** - Run all tests

### Reference

- **[README.md](README.md)** - Overview and quick reference
- **[ISSUES_FIXED.md](ISSUES_FIXED.md)** - Issues found and fixed
- **[REVIEW.md](REVIEW.md)** - Configuration review notes

## 🎯 Choose Your Path

### For Development/Testing
1. Read: [QUICK_START_DEV.md](QUICK_START_DEV.md)
2. Follow: [GETTING_STARTED.md](GETTING_STARTED.md) - Dev Image Setup section
3. Reference: [FLASH_DEV_IMAGE.md](FLASH_DEV_IMAGE.md) for details

### For Production/Multiple Devices
1. Read: [QUICK_START_PREBUILT.md](QUICK_START_PREBUILT.md)
2. Follow: [GETTING_STARTED.md](GETTING_STARTED.md) - Pre-built Image Setup section
3. Reference: [PREBUILT_IMAGE.md](PREBUILT_IMAGE.md) for details

### Need Help?
1. Check: [GETTING_STARTED.md](GETTING_STARTED.md) - Troubleshooting section
2. Review: [HOW_IT_WORKS.md](HOW_IT_WORKS.md) - Understanding the process
3. Test: [TESTING.md](TESTING.md) - Validation and testing

## 📁 File Structure

```
rpi-image/
├── GETTING_STARTED.md          # Main getting started guide
├── QUICK_START_DEV.md          # Dev image quick start
├── QUICK_START_PREBUILT.md     # Pre-built image quick start
├── FLASH_DEV_IMAGE.md          # Detailed dev image guide
├── PREBUILT_IMAGE.md           # Pre-built image guide
├── HOW_IT_WORKS.md             # How it works explanation
├── TESTING.md                  # Testing documentation
├── README.md                   # Overview
├── INDEX.md                    # This file
│
├── cloud-init/
│   ├── user-data.yml           # Production cloud-init config
│   └── user-data-dev.yml       # Dev cloud-init config
│
├── first-boot/
│   ├── setup.sh                # Production setup script
│   └── setup-dev.sh        # Dev setup script
│
├── systemd/
│   ├── calvin-backend.service  # Backend service
│   ├── calvin-frontend.service # Frontend service
│   ├── calvin-update.service   # Update service
│   └── calvin-update.timer     # Update timer
│
└── scripts/
    ├── validate.ps1            # Validation script
    ├── test-bash-syntax.ps1    # Bash syntax test
    └── test-all.ps1            # Run all tests
```

## 🔍 Quick Reference

### Common Tasks

**Flash dev image:**
- See: [QUICK_START_DEV.md](QUICK_START_DEV.md)

**Create pre-built image:**
- See: [QUICK_START_PREBUILT.md](QUICK_START_PREBUILT.md)

**Troubleshoot:**
- See: [GETTING_STARTED.md](GETTING_STARTED.md) - Troubleshooting section

**Test configuration:**
- See: [TESTING.md](TESTING.md)

**Understand how it works:**
- See: [HOW_IT_WORKS.md](HOW_IT_WORKS.md)

## 💡 Tips

1. **Start with GETTING_STARTED.md** - It has everything you need
2. **Use quick start guides** for fast setup
3. **Check troubleshooting** if something goes wrong
4. **Test your configuration** before flashing
5. **Read HOW_IT_WORKS.md** to understand the process

## 📞 Support

- **Documentation:** All guides are in this directory
- **Issues:** Report on GitHub
- **Questions:** Check troubleshooting sections


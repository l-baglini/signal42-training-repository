# x86 Bootloader in Assembly

A minimal but complete x86 MBR bootloader written in NASM assembly, tested in QEMU. Built entirely with AI for the Signal42 workshop homework-01.

## What it does

When the machine powers on, the BIOS searches attached drives for a valid boot sector — a 512-byte block whose last two bytes are `0x55 0xAA`. When it finds one, it loads it at physical address `0x7C00` and jumps to it. That's where our code takes over.

The bootloader:

1. Sets up a clean environment (zeroes segment registers, establishes a stack)
2. Saves the boot drive number passed in `DL` by the BIOS
3. Clears the screen by switching to VGA text mode 80×25
4. Prints a banner and system info via BIOS interrupt `INT 10h`
5. Reports which drive it booted from (e.g. `0x00` = floppy, `0x80` = first hard disk)
6. Halts the CPU with `HLT` in a loop

Expected output:

```
  +-----------------------------------------+
  |   signal42 x86 Bootloader  v1.0         |
  +-----------------------------------------+

  Running in 16-bit real mode.
  Loaded by BIOS at 0x7C00.
  Boot drive: 0x00

  System halted. Power off or reset.
```

## How it works

### The 512-byte constraint

The BIOS only loads one sector from disk — 512 bytes, no more. Everything the bootloader does must fit in that space. NASM's `times` directive pads the binary to exactly 510 bytes, then the two-byte magic signature `0xAA55` fills bytes 510–511.

### Real mode

The CPU starts in **16-bit real mode**: a 20-bit address space (1 MB), no memory protection, no virtual memory. Segment registers (`DS`, `ES`, `SS`) are added to addresses to form physical addresses. The BIOS leaves them in an undefined state, so the first thing we do is zero them all and set up the stack pointer.

### BIOS interrupts

In real mode the BIOS provides a set of software interrupts for hardware I/O:

| Interrupt | Function | Used for |
|-----------|----------|----------|
| `INT 10h / AH=00h` | Set video mode | Clear screen, switch to 80×25 text |
| `INT 10h / AH=0Eh` | Teletype output | Print characters to screen |

### Hex printing

To display the boot drive number in hex, the bootloader splits the byte into two 4-bit nibbles, converts each to its ASCII character (`0`–`9` or `A`–`F`), and prints them individually using the same BIOS teletype interrupt.

## Project structure

```
bootloader/
├── boot.asm    # fully commented NASM source
├── boot.bin    # compiled flat binary (512 bytes, git-ignored)
└── Makefile    # build and run targets
```

## Dependencies

- **NASM** — assembler (`sudo apt install nasm`)
- **QEMU** — x86 emulator (`sudo apt install qemu-system-x86`)

## Usage

```bash
cd bootloader

make            # compile boot.asm → boot.bin
make run        # run in QEMU, output in terminal (Ctrl+A then X to quit)
make run-gui    # run in QEMU with a graphical VGA window
make clean      # remove boot.bin
```

### How QEMU boots it

QEMU is told to treat `boot.bin` as a raw floppy image:

```
qemu-system-x86_64 -drive format=raw,file=boot.bin,if=floppy -nographic -no-reboot -no-shutdown
```

SeaBIOS (QEMU's built-in BIOS) tries the hard disk first, fails (no disk image), then tries the floppy, finds `0xAA55` at offset 510, loads the sector to `0x7C00`, and jumps to it.

## The boot process end-to-end

```
Power on
  └─ BIOS (SeaBIOS in QEMU) initialises hardware
       └─ searches drives for a sector ending in 0x55 0xAA
            └─ loads that sector to physical address 0x7C00
                 └─ jumps to 0x7C00
                      └─ our bootloader runs in 16-bit real mode
                           └─ prints banner, reports drive, halts
```

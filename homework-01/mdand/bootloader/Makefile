# Makefile for the signal42 x86 bootloader

ASM      = nasm
ASMFLAGS = -f bin
SRC      = boot.asm
BIN      = boot.bin
QEMU     = qemu-system-x86_64

.PHONY: all clean run

all: $(BIN)

# Assemble to a flat binary; NASM enforces the 512-byte limit via `times`
$(BIN): $(SRC)
	$(ASM) $(ASMFLAGS) -o $@ $<
	@echo "Built $@ ($$(wc -c < $@) bytes)"

# Boot the image in QEMU (no display window needed — serial output only)
# -drive: attach our 512-byte image as a raw floppy-style disk
# -nographic: redirect VGA text to terminal so we can see the output
run: $(BIN)
	$(QEMU) -drive format=raw,file=$(BIN),if=floppy -nographic -no-reboot -no-shutdown

# Boot in QEMU with a graphical window (classic VGA text mode)
run-gui: $(BIN)
	$(QEMU) -drive format=raw,file=$(BIN),if=floppy -no-reboot

clean:
	rm -f $(BIN)

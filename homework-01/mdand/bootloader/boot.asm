; =============================================================================
; boot.asm — x86 MBR Bootloader
;
; The BIOS loads this code at physical address 0x7C00 in 16-bit real mode.
; It must be exactly 512 bytes and end with the magic signature 0xAA55.
; =============================================================================

    bits 16             ; emit 16-bit instructions (real mode)
    org  0x7C00         ; tell NASM the code will run at 0x7C00

; -----------------------------------------------------------------------------
; Entry point — BIOS jumps here immediately after loading us
; -----------------------------------------------------------------------------
start:
    ; Disable interrupts while we set up a stable stack.
    ; Segment registers left over from BIOS are undefined; zero them out.
    cli

    xor  ax, ax         ; AX = 0
    mov  ds, ax         ; DS = 0  (data segment)
    mov  es, ax         ; ES = 0  (extra segment)
    mov  ss, ax         ; SS = 0  (stack segment)
    mov  sp, 0x7C00     ; stack grows downward from 0x7C00
                        ; (safe: BIOS loaded us here, nothing below it matters)

    sti                 ; re-enable interrupts — keyboard, timer, etc.

    ; DL holds the drive number the BIOS used to boot us (0x00 = floppy,
    ; 0x80 = first hard disk). Save it for later use if needed.
    mov  [boot_drive], dl

    ; Clear the screen by switching to text mode 3 (80×25, 16 colors).
    ; INT 10h / AH=00h: Set Video Mode
    mov  ax, 0x0003
    int  0x10

    ; Print the banner and messages
    mov  si, msg_banner
    call print_string

    mov  si, msg_line1
    call print_string

    mov  si, msg_line2
    call print_string

    mov  si, msg_drive
    call print_string

    ; Print the drive number in hex (e.g. "0x80")
    mov  al, [boot_drive]
    call print_hex_byte

    mov  si, msg_newline
    call print_string

    mov  si, msg_halt
    call print_string

; -----------------------------------------------------------------------------
; Hang forever — a bootloader has nowhere to return to.
; HLT suspends the CPU until the next interrupt; the loop catches NMIs.
; -----------------------------------------------------------------------------
.halt:
    hlt
    jmp  .halt


; =============================================================================
; print_string — print a NUL-terminated string via BIOS teletype output
;
; Input:  SI = pointer to the string
; Clobbers: AX, BX, SI
; =============================================================================
print_string:
    mov  ah, 0x0E       ; BIOS INT 10h / AH=0Eh: Teletype Output
    mov  bh, 0x00       ; page number 0
    mov  bl, 0x07       ; text attribute: light grey on black (ignored in most modes)
.loop:
    lodsb               ; AL = [SI], then SI++
    test al, al         ; NUL terminator?
    jz   .done
    int  0x10           ; print the character in AL
    jmp  .loop
.done:
    ret


; =============================================================================
; print_hex_byte — print one byte as a 2-digit hex string, e.g. 0x8E → "8E"
;
; Input:  AL = byte to print
; Clobbers: AX, BX, CX
; =============================================================================
print_hex_byte:
    mov  cl, al         ; save the full byte

    ; Print "0x" prefix
    mov  si, hex_prefix
    call print_string

    ; High nibble
    mov  al, cl
    shr  al, 4          ; shift high nibble into low position
    call nibble_to_char
    call print_char

    ; Low nibble
    mov  al, cl
    and  al, 0x0F       ; mask off high nibble
    call nibble_to_char
    call print_char

    ret

; nibble_to_char: convert a value 0–15 into its ASCII hex character
nibble_to_char:
    cmp  al, 9
    jle  .digit
    add  al, 'A' - 10   ; 10–15 → 'A'–'F'
    ret
.digit:
    add  al, '0'        ; 0–9  → '0'–'9'
    ret

; print_char: print the character in AL using BIOS teletype
print_char:
    mov  ah, 0x0E
    mov  bh, 0x00
    mov  bl, 0x07
    int  0x10
    ret


; =============================================================================
; Data section
; =============================================================================
boot_drive  db  0               ; drive number saved from DL at entry

hex_prefix  db  "0x", 0

; CRLF-terminated strings for BIOS teletype (CR=0x0D moves to col 0,
; LF=0x0A advances one line)
msg_banner  db  0x0D, 0x0A
            db  "  +-----------------------------------------+", 0x0D, 0x0A
            db  "  |   signal42 x86 Bootloader  v1.0         |", 0x0D, 0x0A
            db  "  +-----------------------------------------+", 0x0D, 0x0A, 0

msg_line1   db  0x0D, 0x0A
            db  "  Running in 16-bit real mode.", 0x0D, 0x0A, 0

msg_line2   db  "  Loaded by BIOS at 0x7C00.", 0x0D, 0x0A, 0

msg_drive   db  "  Boot drive: ", 0

msg_halt    db  0x0D, 0x0A
            db  "  System halted. Power off or reset.", 0x0D, 0x0A, 0

msg_newline db  0x0D, 0x0A, 0


; =============================================================================
; Boot sector padding and signature
;
; The MBR must be exactly 512 bytes.  NASM's `times` directive pads the
; remaining space with zeros.  The last two bytes must be 0x55 and 0xAA —
; the BIOS checks this magic before jumping to 0x7C00.
; =============================================================================
    times 510 - ($ - $$) db 0  ; pad to byte 510 with zeros
    dw    0xAA55                ; boot signature (little-endian: 0x55 then 0xAA)

/* MiniASM VM */

/* opcodes */
const OP_HALT  = 0b000000;
const OP_BREAK = 0b111111;
const OP_NOT   = 0b000001;
const OP_PUSH  = 0b000010;
const OP_POP   = 0b000011;
const OP_PRINT = 0b000100;
const OP_READ  = 0b000101;
const OP_SL    = 0b000110;
const OP_SRU   = 0b000111;
const OP_SRS   = 0b001000;
const OP_MOV   = 0b001001;
const OP_ADD   = 0b001010;
const OP_SUB   = 0b001011;
const OP_AND   = 0b001100;
const OP_OR    = 0b001101;
const OP_XOR   = 0b001110;
const OP_CMP   = 0b001111;
const OP_SW    = 0b010000;
const OP_LW    = 0b010001;
const OP_SB    = 0b010010;
const OP_LB    = 0b010011;
const OP_MOVI  = 0b010100;
const OP_ADDI  = 0b010101;
const OP_SUBI  = 0b010110;
const OP_ANDI  = 0b010111;
const OP_ORI   = 0b011000;
const OP_XORI  = 0b011001;
const OP_JMP   = 0b011010;
const OP_JMPEQ = 0b011011;
const OP_JMPNE = 0b011100;
const OP_JMPGT = 0b011101;
const OP_JMPLT = 0b011110;
const OP_JMPGE = 0b011111;
const OP_JMPLE = 0b100000;

/* misc constants */
const NUM_REGS = 32;
const MEM_SIZE = 1024;

const R_PC = 26;
const R_SP = 27;
const R_ST = 28;

const Z = (1 << 0);  // status register bit Z
const S = (1 << 1);  // status register bit S

const CODE_START = 128;
const CODE_MAX = 512;

const STAT_IN_PROGRESS              = 1;
const STAT_TERM_SUCCESS             = 2;
const STAT_PAUSED                   = 3;
const STAT_BREAKPOINT               = 4;
const STAT_TERM_FAILURE_BAD_OPCODE  = 5;
const STAT_TERM_FAILURE_MEM_BOUNDS  = 6;
const STAT_TERM_FAILURE_MEM_ALIGN   = 7;
const STAT_TERM_FAILURE_TOO_LONG    = 8;

const LOAD_SUCCESSFUL               = 0;
const ERROR_EMPTY_CODE_STR          = -1;
const ERROR_MALFORMED_CODE_STR      = -2;
const ERROR_CODE_STR_TOO_LONG       = -3;

const PROGRAM_STEP_LIMIT = 10000;

let regFile = new Uint16Array(NUM_REGS);
let mem = new Uint8Array(MEM_SIZE);
let progStdout = "";
let progStdin  = "";

const STDOUT_MAX_LEN = 128;

function getErrorMessage(status) {
    status = parseInt(status);
    switch (status) {
        case STAT_IN_PROGRESS:
            return "Execution in progress...";
        case STAT_TERM_SUCCESS:
            return "Execution successful";
        case STAT_PAUSED:
            return "Paused";
        case STAT_BREAKPOINT:
            return "Breakpoint reached";
        case STAT_TERM_FAILURE_BAD_OPCODE:
            return "Unknown opcode encountered";
        case STAT_TERM_FAILURE_MEM_BOUNDS:
            return "Program attempted to access non-existent memory location";
        case STAT_TERM_FAILURE_MEM_ALIGN:
            return "Misaligned memory address in store-word or load-word instruction";
        case STAT_TERM_FAILURE_TOO_LONG:
            return "Program took too many steps (limit: " + PROGRAM_STEP_LIMIT + ")";
        case LOAD_SUCCESSFUL:
            return "Load successful";
        case ERROR_EMPTY_CODE_STR:
            return "Empty code string";
        case ERROR_MALFORMED_CODE_STR:
            return "Malformed code string";
        case ERROR_CODE_STR_TOO_LONG:
            return "Code string too long";
        default:
            console.log("Unknown status: " + status);
            return "Internal error: unknown status code";
    }
}

let paused = false;

let regChangeCallback = function (reg) {};
let memChangeCallback = function (addr) {};
let stdoutChangeCallback = function () {};
let stdinChangeCallback = function () {};

function initRegs() {
    for (let i = 0; i < NUM_REGS; i++) {
        regFile[i] = 0;
        regChangeCallback(i);
    }

    regFile[R_PC] = CODE_START;
    regChangeCallback(R_PC);
    regFile[R_SP] = MEM_SIZE - 2;
    regChangeCallback(R_SP);
}

function initMem() {
    for (let i = 0; i < MEM_SIZE; i++) {
        mem[i] = 0;
        memChangeCallback(i);
    }
}

function loadCode(codeStr) {
    if (!codeStr)
        return ERROR_EMPTY_CODE_STR;

    if (!(/^([0-9a-fA-F]{4})*$/.test(codeStr)))
        return ERROR_MALFORMED_CODE_STR;

    if (codeStr.length > CODE_MAX)
        return ERROR_CODE_STR_TOO_LONG;

    let v = codeStr.match(/.{1,4}/g);

    for (let i = 0; i < v.length; i++) {
        ins = parseInt(v[i], 16);
        mem[CODE_START + 2*i] = ((ins & 0xFF00) >> 8);
        mem[CODE_START + 2*i + 1] = (ins & 0x00FF);
        memChangeCallback(CODE_START + 2*i);
        memChangeCallback(CODE_START + 2*i + 1);
    }

    return LOAD_SUCCESSFUL;
}

function step() {
    if (regFile[R_PC] < 0 || regFile[R_PC]+1 >= MEM_SIZE) {
        return STAT_TERM_FAILURE_MEM_BOUNDS;
    } else if (regFile[R_PC] % 2 !== 0) {
        return STAT_TERM_FAILURE_MEM_ALIGN;
    } else {
        let ins = ((((mem[regFile[R_PC]] >>> 0) & 0xFF) << 8) | ((mem[regFile[R_PC]+1] >>> 0) & 0xFF));
        regFile[R_PC] += 2;
        regChangeCallback(R_PC);
        return executeInstruction(ins);
    }
}

function execute() {
    let stepCount = 0;
    let status = STAT_IN_PROGRESS;

    while (status === STAT_IN_PROGRESS) {
        if (stepCount === PROGRAM_STEP_LIMIT)
            return STAT_TERM_FAILURE_TOO_LONG;

        if (paused)
            return STAT_PAUSED;
        status = step();
        stepCount++;
    }

    return status;
}

function read(R_D) {
    console.assert(regFile[R_D] >= 0 && regFile[R_D] < MEM_SIZE, "read address out of bounds");
    mem[regFile[R_D]] = progStdin.length ? progStdin.charCodeAt(0) : 0;
    memChangeCallback(regFile[R_D]);
    progStdin = progStdin.substring(1);
    stdinChangeCallback();
}

function updateStatusReg(value) {
        if (value === 0)
            regFile[R_ST] |= Z;
        else
            regFile[R_ST] &= ~Z;

        if (value < 0)
            regFile[R_ST] |= S;
        else
            regFile[R_ST] &= ~S;

        regChangeCallback(R_ST);
}

function executeInstruction(ins) {
    const OP = ((ins & 0b1111110000000000) >> 10);
    const R_D = ((ins & 0b0000001111100000) >> 5);
    const R_S = (ins & 0b0000000000011111);
    const I = (ins & 0b0000000000011111);
    const J = (ins & 0b0000001111111111);

    const Jsigned = (J & 0b0000001000000000) ? -(~(J-1) & 0b0000001111111111) : J;
    const Isigned = (I & 0b0000000000010000) ? -(~(I-1) & 0b0000000000011111) : I;

    switch (OP) {
        case OP_HALT:
            return STAT_TERM_SUCCESS;
        case OP_BREAK:
            return STAT_BREAKPOINT;
        case OP_NOT:
            regFile[R_D] = ~regFile[R_D];
            regChangeCallback(R_D);
            break;
        case OP_PUSH:
            if (regFile[R_SP] < 0 || regFile[R_SP]+1 >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;
            if (regFile[R_SP] % 2 !== 0)
                return STAT_TERM_FAILURE_MEM_ALIGN;

            mem[regFile[R_SP]] = (regFile[R_D] & 0xFF00) >> 8;
            mem[regFile[R_SP]+1] = (regFile[R_D] & 0x00FF);

            memChangeCallback(regFile[R_SP]);
            memChangeCallback(regFile[R_SP]+1);

            regFile[R_SP] -= 2;
            regChangeCallback(R_SP);
            break;
        case OP_POP:
            regFile[R_SP] += 2;
            regChangeCallback(R_SP);

            if (regFile[R_SP] < 0 || regFile[R_SP]+1 >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;
            if (regFile[R_SP] % 2 !== 0)
                return STAT_TERM_FAILURE_MEM_ALIGN;

            regFile[R_D] = (mem[regFile[R_SP]] << 8) | mem[regFile[R_SP]+1];
            regChangeCallback(R_D);
            break;
        case OP_PRINT:
            if (regFile[R_D] < 0 || regFile[R_D] >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;

            progStdout += String.fromCharCode(mem[regFile[R_D]]);
            if (progStdout.length > STDOUT_MAX_LEN)
                progStdout = progStdout.slice(-STDOUT_MAX_LEN);

            stdoutChangeCallback();
            break;
        case OP_READ:
            if (regFile[R_D] < 0 || regFile[R_D] >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;

            read(R_D);
            break;
        case OP_SL:
            regFile[R_D] = regFile[R_D] << regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_SRU:
            regFile[R_D] = regFile[R_D] >>> regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_SRS:
            regFile[R_D] = regFile[R_D] >> regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_MOV:
            regFile[R_D] = regFile[R_S];
            regChangeCallback(R_D);
            break;
        case OP_ADD:
            regFile[R_D] = regFile[R_D] + regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_SUB:
            regFile[R_D] = regFile[R_D] - regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_AND:
            regFile[R_D] = regFile[R_D] & regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_OR:
            regFile[R_D] = regFile[R_D] | regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_XOR:
            regFile[R_D] = regFile[R_D] ^ regFile[R_S];
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_CMP:
            if (regFile[R_D] === regFile[R_S])
                regFile[R_ST] |= Z;
            else
                regFile[R_ST] &= ~Z;

            if (regFile[R_D] < regFile[R_S])
                regFile[R_ST] |= S;
            else
                regFile[R_ST] &= ~S;

            regChangeCallback(R_ST);
            break;
        case OP_SW:
            if (regFile[R_D] < 0 || regFile[R_D]+1 >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;
            if (regFile[R_D] % 2 !== 0)
                return STAT_TERM_FAILURE_MEM_ALIGN;

            mem[regFile[R_D]] = (regFile[R_S] & 0xFF00) >> 8;
            mem[regFile[R_D]+1] = (regFile[R_S] & 0x00FF);
            memChangeCallback(regFile[R_D]);
            memChangeCallback(regFile[R_D]+1);
            break;
        case OP_LW:
            if (regFile[R_S] < 0 || regFile[R_S]+1 >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;
            if (regFile[R_S] % 2 !== 0)
                return STAT_TERM_FAILURE_MEM_ALIGN;

            regFile[R_D] = (mem[regFile[R_S]] << 8) | mem[regFile[R_S]+1];
            regChangeCallback(R_D);
            break;
        case OP_SB:
            if (regFile[R_D] < 0 || regFile[R_D] >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;

            mem[regFile[R_D]] = (regFile[R_S] & 0x00FF);
            memChangeCallback(regFile[R_D]);
            break;
        case OP_LB:
            if (regFile[R_S] < 0 || regFile[R_S] >= MEM_SIZE)
                return STAT_TERM_FAILURE_MEM_BOUNDS;

            regFile[R_D] = mem[regFile[R_S]];
            regChangeCallback(R_D);
            break;
        case OP_MOVI:
            regFile[R_D] = Isigned;
            regChangeCallback(R_D);
            break;
        case OP_ADDI:
            regFile[R_D] = regFile[R_D] + Isigned;
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_SUBI:
            regFile[R_D] = regFile[R_D] - Isigned;
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_ANDI:
            regFile[R_D] = regFile[R_D] & Isigned;
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_ORI:
            regFile[R_D] = regFile[R_D] | Isigned;
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_XORI:
            regFile[R_D] = regFile[R_D] ^ Isigned;
            regChangeCallback(R_D);
            updateStatusReg(regFile[R_D]);
            break;
        case OP_JMP:
            regFile[R_PC] = regFile[R_PC] + Jsigned;
            regChangeCallback(R_PC);
            break;
        case OP_JMPEQ:
            if (regFile[R_ST] & Z) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        case OP_JMPNE:
            if (!(regFile[R_ST] & Z)) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        case OP_JMPGT:
            if ((regFile[R_ST] & S) && !(regFile[R_ST] & Z)) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        case OP_JMPLT:
            if (regFile[R_ST] & S) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        case OP_JMPGE:
            if (!(regFile[R_ST] & S)) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        case OP_JMPLE:
            if ((regFile[R_ST] & S) || !(regFile[R_ST] & Z)) {
                regFile[R_PC] = regFile[R_PC] + Jsigned;
                regChangeCallback(R_PC);
            }
            break;
        default:
            return STAT_TERM_FAILURE_BAD_OPCODE;
    }

    return STAT_IN_PROGRESS;
}


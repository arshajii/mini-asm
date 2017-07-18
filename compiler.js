/* MiniASM Compiler */

const INS_TYPE = {
    R0: 0,
    R1: 1,
    R2: 2,
    I:  3,
    J:  4
};

const INS_WIDTH  = 2;
const REG_COUNT  = 32;
const IMM_MIN    = -16;
const IMM_MAX    = 15;
const START_ADDR = 128;

const OPS = {HALT:  { op: 0b000000, type: INS_TYPE.R0},
             BREAK: { op: 0b111111, type: INS_TYPE.R0},
             NOT:   { op: 0b000001, type: INS_TYPE.R1},
             PUSH:  { op: 0b000010, type: INS_TYPE.R1},
             POP:   { op: 0b000011, type: INS_TYPE.R1},
             PRINT: { op: 0b000100, type: INS_TYPE.R1},
             READ:  { op: 0b000101, type: INS_TYPE.R1},
             SL:    { op: 0b000110, type: INS_TYPE.R2},
             SRU:   { op: 0b000111, type: INS_TYPE.R2},
             SRS:   { op: 0b001000, type: INS_TYPE.R2},
             MOV:   { op: 0b001001, type: INS_TYPE.R2},
             ADD:   { op: 0b001010, type: INS_TYPE.R2},
             SUB:   { op: 0b001011, type: INS_TYPE.R2},
             AND:   { op: 0b001100, type: INS_TYPE.R2},
             OR:    { op: 0b001101, type: INS_TYPE.R2},
             XOR:   { op: 0b001110, type: INS_TYPE.R2},
             CMP:   { op: 0b001111, type: INS_TYPE.R2},
             SW:    { op: 0b010000, type: INS_TYPE.R2},
             LW:    { op: 0b010001, type: INS_TYPE.R2},
             SB:    { op: 0b010010, type: INS_TYPE.R2},
             LB:    { op: 0b010011, type: INS_TYPE.R2},
             MOVI:  { op: 0b010100, type: INS_TYPE.I},
             ADDI:  { op: 0b010101, type: INS_TYPE.I},
             SUBI:  { op: 0b010110, type: INS_TYPE.I},
             ANDI:  { op: 0b010111, type: INS_TYPE.I},
             ORI:   { op: 0b011000, type: INS_TYPE.I},
             XORI:  { op: 0b011001, type: INS_TYPE.I},
             JMP:   { op: 0b011010, type: INS_TYPE.J},
             JMPEQ: { op: 0b011011, type: INS_TYPE.J},
             JMPNE: { op: 0b011100, type: INS_TYPE.J},
             JMPGT: { op: 0b011101, type: INS_TYPE.J},
             JMPLT: { op: 0b011110, type: INS_TYPE.J},
             JMPGE: { op: 0b011111, type: INS_TYPE.J},
             JMPLE: { op: 0b100000, type: INS_TYPE.J}};

const R0_FMT = /^(\w+)$/;
const R1_FMT = /^(\w+)\s+[rR](\d+)$/;
const R2_FMT = /^(\w+)\s+[rR](\d+)\s+[rR](\d+)$/;
const I_FMT  = /^(\w+)\s+[rR](\d+)\s+(-?\d+)$/;
const J_FMT  = /^(\w+)\s+(\w+)$/;
const ALL_INS_FMTS = [R0_FMT, R1_FMT, R2_FMT, I_FMT, J_FMT];

const LABEL_FMT = /^(^\w+):$/;

let compilerErrorMessage = "";

function makeInsR0(opcode) {
    return opcode << 10;
}

function makeInsR1(opcode, rd) {
    return (opcode << 10) | (rd << 5);
}

function makeInsR2(opcode, rd, rs) {
    return (opcode << 10) | (rd << 5) | rs;
}

function makeInsI(opcode, rd, i) {
    return (opcode << 10) | (rd << 5) | (i & 0b11111);
}

function makeInsJ(opcode, j) {
    return (opcode << 10) | (j & 0b1111111111);
}

function parseLine(line, addr, labels) {
    let m = R0_FMT.exec(line);

    if (m != null) {
        let op = OPS[m[1].toUpperCase()];

        if (!op || op.type !== INS_TYPE.R0)
            return errorOnLine(line);

        return makeInsR0(op.op);
    }

    m = R1_FMT.exec(line);

    if (m != null) {
        let op = OPS[m[1].toUpperCase()];
        let rd = parseInt(m[2]);
        if (!checkReg(rd))
            return null;

        if (!op || op.type !== INS_TYPE.R1)
            return errorOnLine(line);

        return makeInsR1(op.op, rd);
    }

    m = R2_FMT.exec(line);

    if (m != null) {
        let op = OPS[m[1].toUpperCase()];
        let rd = parseInt(m[2]);
        let rs = parseInt(m[3]);
        if (!checkReg(rd))
            return null;
        if (!checkReg(rs))
            return null;

        if (!op || op.type !== INS_TYPE.R2)
            return errorOnLine(line);

        return makeInsR2(op.op, rd, rs);
    }

    m = I_FMT.exec(line)

    if (m != null) {
        let op = OPS[m[1].toUpperCase()];
        let rd = parseInt(m[2]);
        let imm = parseInt(m[3]);
        if (!checkReg(rd))
            return null;
        if (!checkImm(imm))
            return null;

        if (!op || op.type !== INS_TYPE.I)
            return errorOnLine(line);

        return makeInsI(op.op, rd, imm);
    }

    m = J_FMT.exec(line)

    if (m != null) {
        let op = OPS[m[1].toUpperCase()];
        let label = m[2];

        if (!op || op.type !== INS_TYPE.J)
            return errorOnLine(line);

        if (!(label in labels)) {
            compilerErrorMessage = "unknown label: " + label;
            return null;
        }

        let dest = labels[label];
        let j = dest - addr - 2;

        return makeInsJ(op.op, j);
    }

    return errorOnLine(line);
}

function scanForLabels(lines) {
    let labels = {};
    let addr = START_ADDR;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let m = LABEL_FMT.exec(line);

        if (m != null) {
            let label = m[1];
            if (label in labels) {
                compilerErrorMessage = "duplicate label: " + label;
                return null;
            }
            labels[label] = addr;
        } else {
            for (let i = 0; i < ALL_INS_FMTS.length; i++) {
                if (ALL_INS_FMTS[i].exec(line) != null) {
                    addr += INS_WIDTH;
                    break;
                }
            }
        }
    }

    return labels;
}

function compile(lines) {
    lines = lines.split(/\r?\n/);

    linesFiltered = []
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim().split(/#/)[0].trim();  // remove comments
        if (line !== "")
            linesFiltered.push(line);
    }
    lines = linesFiltered;

    let labels = scanForLabels(lines);

    if (labels == null)
        return null;

    let addr = START_ADDR;
    let compiledIns = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (LABEL_FMT.exec(line) != null)
            continue;

        let ins = parseLine(line, addr, labels);

        if (ins != null) {
            compiledIns.push(ins);
            addr += INS_WIDTH;
        } else {
            return null;
        }
    }

    compiledStr = "";

    for (let i = 0; i < compiledIns.length; i++)
        compiledStr += ("0000" + (compiledIns[i] >>> 0).toString(16)).slice(-4);

    return compiledStr;
}

function errorOnLine(line) {
    compilerErrorMessage = "syntax error on line: " + line;
    return null;
}

function checkReg(r) {
    if (!(0 <= r && r < REG_COUNT)) {
        compilerErrorMessage = "invalid register: " + r + " -- registers must be in the range [0," + REG_COUNT + ")";
        return false;
    }
    return true;
}

function checkImm(imm) {
    if (!(IMM_MIN <= imm && imm <= IMM_MAX)) {
        compilerErrorMessage = "invalid immediate: " + imm + " -- immediates must be in the range [" + IMM_MIN + ',' + IMM_MAX + "]";
        return false;
    }
    return true;
}


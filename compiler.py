#!/usr/bin/env python
# Compiler for MiniASM

import sys
import re

R0, R1, R2, I, J = 0, 1, 2, 3, 4
INS_WIDTH = 2
REG_COUNT = 32
IMM_RANGE = (-16, 15)
START_ADDRESS = 128

ops = [('HALT ', 0b000000, R0),
       ('NOT  ', 0b000001, R1),
       ('PUSH ', 0b000010, R1),
       ('POP  ', 0b000011, R1),
       ('PRINT', 0b000100, R1),
       ('READ ', 0b000101, R1),
       ('SL   ', 0b000110, R2),
       ('SRU  ', 0b000111, R2),
       ('SRS  ', 0b001000, R2),
       ('MOV  ', 0b001001, R2),
       ('ADD  ', 0b001010, R2),
       ('SUB  ', 0b001011, R2),
       ('AND  ', 0b001100, R2),
       ('OR   ', 0b001101, R2),
       ('XOR  ', 0b001110, R2),
       ('CMP  ', 0b001111, R2),
       ('SW   ', 0b010000, R2),
       ('LW   ', 0b010001, R2),
       ('SB   ', 0b010010, R2),
       ('LB   ', 0b010011, R2),
       ('MOVI ', 0b010100, I),
       ('ADDI ', 0b010101, I),
       ('SUBI ', 0b010110, I),
       ('ANDI ', 0b010111, I),
       ('ORI  ', 0b011000, I),
       ('XORI ', 0b011001, I),
       ('JMP  ', 0b011010, J),
       ('JMPEQ', 0b011011, J),
       ('JMPNE', 0b011100, J),
       ('JMPGT', 0b011101, J),
       ('JMPLT', 0b011110, J),
       ('JMPGE', 0b011111, J),
       ('JMPLE', 0b100000, J)]

ops = {op[0].strip(): (op[1], op[2]) for op in ops}

R0_FMT = re.compile(r'^(\w+)$')
R1_FMT = re.compile(r'^(\w+)\s+[rR](\d+)$')
R2_FMT = re.compile(r'^(\w+)\s+[rR](\d+)\s+[rR](\d+)$')
I_FMT  = re.compile(r'^(\w+)\s+[rR](\d+)\s+(-?\d+)$')
J_FMT  = re.compile(r'^(\w+)\s+(\w+)$')
ALL_INS_FMTS = [R0_FMT, R1_FMT, R2_FMT, I_FMT, J_FMT]

LABEL_FMT = re.compile(r'^(^\w+):$')

def make_ins_r0(opcode):
    return opcode << 10

def make_ins_r1(opcode, r_d):
    return (opcode << 10) | (r_d << 5)

def make_ins_r2(opcode, r_d, r_s):
    return (opcode << 10) | (r_d << 5) | r_s

def make_ins_i(opcode, r_d, i):
    return (opcode << 10) | (r_d << 5) | (i & 0b11111)

def make_ins_j(opcode, j):
    return (opcode << 10) | (j & 0b1111111111)

def parse_line(line, addr, labels):
    if LABEL_FMT.match(line):
        return None

    m = R0_FMT.match(line)

    if m:
        op = ops.get(m.group(1).upper(), None)

        if not op or op[1] != R0:
            error_on_line(line)

        return make_ins_r0(op[0])

    m = R1_FMT.match(line)

    if m:
        op = ops.get(m.group(1).upper(), None)
        r_d = int(m.group(2))
        check_reg(r_d)

        if not op or op[1] != R1:
            error_on_line(line)

        return make_ins_r1(op[0], r_d)

    m = R2_FMT.match(line)

    if m:
        op = ops.get(m.group(1).upper(), None)
        r_d = int(m.group(2))
        r_s = int(m.group(3))
        check_reg(r_d)
        check_reg(r_s)

        if not op or op[1] != R2:
            error_on_line(line)

        return make_ins_r2(op[0], r_d, r_s)

    m = I_FMT.match(line)

    if m:
        op = ops.get(m.group(1).upper(), None)
        r_d = int(m.group(2))
        imm = int(m.group(3))
        check_reg(r_d)
        check_imm(imm)

        if not op or op[1] != I:
            error_on_line(line)

        return make_ins_i(op[0], r_d, imm)

    m = J_FMT.match(line)

    if m:
        op = ops.get(m.group(1).upper(), None)
        label = m.group(2)

        if not op or op[1] != J:
            error_on_line(line)

        if label not in labels:
            sys.stderr.write('unknown label: ' + label + '\n')
            sys.exit(-1)

        dest = labels[label]
        j = dest - addr - 2

        return make_ins_j(op[0], j)

    error_on_line(line)

def scan_for_labels(lines):
    labels = dict()
    addr = START_ADDRESS

    for line in lines:
        line = line.strip()
        m = LABEL_FMT.match(line)

        if m:
            label = m.group(1)
            if label in labels:
                sys.stderr.write('duplicate label: ' + label + '\n')
                sys.exit(-1)
            labels[label] = addr
        elif any(m.match(line) for m in ALL_INS_FMTS):
            addr += INS_WIDTH

    return labels

def error_on_line(line):
    sys.stderr.write('syntax error on line: ' + line + '\n')
    sys.exit(-1)

def check_reg(r):
    if not (0 <= r < REG_COUNT):
        sys.stderr.write('invalid register: ' + str(r) +
          ' -- registers must be in the range [0,' + str(REG_COUNT) + ')\n')
        sys.exit(-1)

def check_imm(imm):
    if not (IMM_RANGE[0] <= imm <= IMM_RANGE[1]):
        sys.stderr.write('invalid immediate: ' + str(imm) +
          ' -- immediates must be in the range [' + str(IMM_RANGE[0]) + ',' + str(IMM_RANGE[1]) + ']\n')
        sys.exit(-1)

lines = sys.stdin.read().splitlines()
lines = [line.strip().split('#')[0].strip() for line in lines]
lines = [line for line in lines if line]

labels = scan_for_labels(lines)
addr = START_ADDRESS
compiled_ins = []
for line in lines:
    ins = parse_line(line, addr, labels)

    if ins is not None:
        compiled_ins.append(ins)
        addr += INS_WIDTH

print ''.join('%04x' % ins for ins in compiled_ins)


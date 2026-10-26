const t = (...lines) => lines.join('\n') + '\n';

// The 12 languages both sites support. `lc` = LeetCode langSlug, `pick` = Codeforces dropdown substrings in order of preference.
const LANGS = [
  { key: 'cpp', name: 'C++', file: 'solution.cpp', lc: 'cpp', interpreted: false, pick: ['G++20', 'G++17', 'G++'],
    template: t('#include <bits/stdc++.h>', 'using namespace std;', '', 'int main() {', '    ios::sync_with_stdio(false);', '    cin.tie(nullptr);', '', '    return 0;', '}') },
  { key: 'c', name: 'C', file: 'solution.c', lc: 'c', interpreted: false, pick: ['GNU GCC C11', 'GNU GCC', 'GCC'],
    template: t('#include <stdio.h>', '', 'int main(void) {', '', '    return 0;', '}') },
  { key: 'java', name: 'Java', file: 'Main.java', lc: 'java', interpreted: false, pick: ['Java 21', 'Java 17', 'Java 11', 'Java'],
    template: t('import java.util.*;', '', 'public class Main {', '    public static void main(String[] args) {', '        Scanner sc = new Scanner(System.in);', '', '    }', '}') },
  { key: 'python', name: 'Python', file: 'solution.py', lc: 'python3', interpreted: true, pick: ['PyPy 3', 'Python 3'],
    template: t('import sys', 'input = sys.stdin.readline', '', '', 'def main():', '    pass', '', '', 'main()') },
  { key: 'javascript', name: 'JavaScript', file: 'solution.js', lc: 'javascript', interpreted: true, pick: ['Node.js', 'JavaScript'],
    template: t("const lines = require('fs').readFileSync(0, 'utf8').split('\\n');", 'let pos = 0;', 'const next = () => lines[pos++];', '', '') },
  { key: 'kotlin', name: 'Kotlin', file: 'solution.kt', lc: 'kotlin', interpreted: false, pick: ['Kotlin 1.9', 'Kotlin 1.7', 'Kotlin'],
    template: t('import java.io.*', 'import java.util.*', '', 'fun main() {', '    val br = BufferedReader(InputStreamReader(System.`in`))', '', '}') },
  { key: 'go', name: 'Go', file: 'solution.go', lc: 'golang', interpreted: false, pick: ['Go '],
    template: t('package main', '', 'import (', '\t"bufio"', '\t"fmt"', '\t"os"', ')', '', 'func main() {', '\tin := bufio.NewReader(os.Stdin)', '\tout := bufio.NewWriter(os.Stdout)', '\tdefer out.Flush()', '', '\tfmt.Fscan(in)', '\tfmt.Fprint(out)', '}') },
  { key: 'rust', name: 'Rust', file: 'solution.rs', lc: 'rust', interpreted: false, pick: ['Rust'],
    template: t('use std::io::{self, Read, Write};', '', 'fn main() {', '    let mut input = String::new();', '    io::stdin().read_to_string(&mut input).unwrap();', '    let mut it = input.split_ascii_whitespace();', '    let stdout = io::stdout();', '    let mut out = io::BufWriter::new(stdout.lock());', '', '    let _ = (&mut it, &mut out);', '}') },
  { key: 'csharp', name: 'C#', file: 'solution.cs', lc: 'csharp', interpreted: false, pick: ['.NET', 'C#'],
    template: t('using System;', 'using System.Collections.Generic;', 'using System.IO;', 'using System.Linq;', '', 'public class Program', '{', '    public static void Main()', '    {', '        var reader = new StreamReader(Console.OpenStandardInput());', '', '    }', '}') },
  { key: 'ruby', name: 'Ruby', file: 'solution.rb', lc: 'ruby', interpreted: true, pick: ['Ruby'],
    template: t('tokens = STDIN.read.split', '') },
  { key: 'php', name: 'PHP', file: 'solution.php', lc: 'php', interpreted: true, pick: ['PHP'],
    template: t('<?php', '$lines = explode("\\n", stream_get_contents(STDIN));', '') },
  { key: 'scala', name: 'Scala', file: 'Main.scala', lc: 'scala', interpreted: false, pick: ['Scala'],
    template: t('import scala.io.StdIn._', '', 'object Main {', '  def main(args: Array[String]): Unit = {', '', '  }', '}') },
];

module.exports = { LANGS };

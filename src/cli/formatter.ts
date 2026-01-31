export enum OutputFormat {
  TABLE = 'table',
  JSON = 'json',
  CSV = 'csv'
}

export interface FormattableData {
  [key: string]: string | number | boolean | null;
}

export class OutputFormatter {
  private static isTerminal(): boolean {
    return process.stdout.isTTY;
  }

  private static shouldColorize(): boolean {
    return this.isTerminal() && process.env.NO_COLOR !== '1';
  }

  private static colorize(text: string, color: 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'gray'): string {
    if (!this.shouldColorize()) {
      return text;
    }

    const colors = {
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m'
    };
    const reset = '\x1b[0m';

    return `${colors[color]}${text}${reset}`;
  }

  static formatTable(headers: string[], rows: FormattableData[]): string {
    if (rows.length === 0) {
      return this.colorize('No results found', 'gray');
    }

    const columnWidths = headers.map(header => {
      const maxWidth = Math.max(
        header.length,
        ...rows.map(row => String(row[header] || '').length)
      );
      return maxWidth + 2;
    });

    const separator = columnWidths.map(width => '-'.repeat(width)).join('+');

    let output = separator + '\n';

    output += '|';
    headers.forEach((header, i) => {
      const padded = header.padEnd(columnWidths[i] - 2);
      output += ` ${this.colorize(padded, 'cyan')} |`;
    });
    output += '\n' + separator + '\n';

    rows.forEach(row => {
      output += '|';
      headers.forEach((header, i) => {
        const value = String(row[header] || '');
        const padded = value.padEnd(columnWidths[i] - 2);
        output += ` ${padded} |`;
      });
      output += '\n';
    });

    output += separator;

    return output;
  }

  static formatJSON(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  static formatCSV(headers: string[], rows: FormattableData[]): string {
    if (rows.length === 0) {
      return headers.join(',');
    }

    const escapeCSVValue = (value: unknown): string => {
      const str = String(value || '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = headers.map(escapeCSVValue).join(',');
    const dataRows = rows.map(row => 
      headers.map(header => escapeCSVValue(row[header])).join(',')
    );

    return [headerRow, ...dataRows].join('\n');
  }

  static format(data: unknown, format: OutputFormat, headers?: string[]): string {
    switch (format) {
      case OutputFormat.TABLE:
        if (headers && Array.isArray(data)) {
          return this.formatTable(headers, data);
        }
        return this.formatJSON(data);
      case OutputFormat.JSON:
        return this.formatJSON(data);
      case OutputFormat.CSV:
        if (headers && Array.isArray(data)) {
          return this.formatCSV(headers, data);
        }
        return this.formatJSON(data);
      default:
        return this.formatJSON(data);
    }
  }
}

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileInput } from '../../../../src/components/ui/FileInput';
import fileInputStyles from '../../../../src/components/ui/FileInput.module.css';
import { Input } from '../../../../src/components/ui/Input';
import inputStyles from '../../../../src/components/ui/Input.module.css';
import { Label } from '../../../../src/components/ui/Label';
import labelStyles from '../../../../src/components/ui/Label.module.css';
import { Select } from '../../../../src/components/ui/Select';
import selectStyles from '../../../../src/components/ui/Select.module.css';
import { Textarea } from '../../../../src/components/ui/Textarea';
import textareaStyles from '../../../../src/components/ui/Textarea.module.css';

describe('Input', () => {
    it('applies its style plus any extra class', () => {
        render(<Input aria-label="Email" className="wide" />);
        expect(screen.getByLabelText('Email')).toHaveClass(
            inputStyles.input,
            'wide'
        );
    });

    it('passes native input props through', async () => {
        const onChange = vi.fn();
        render(
            <Input
                aria-label="Email"
                type="email"
                placeholder="you@school.edu"
                required
                onChange={onChange}
            />
        );
        const input = screen.getByLabelText('Email');
        expect(input).toHaveAttribute('type', 'email');
        expect(input).toHaveAttribute('placeholder', 'you@school.edu');
        expect(input).toBeRequired();

        await userEvent.type(input, 'a');
        expect(onChange).toHaveBeenCalled();
    });
});

describe('Textarea', () => {
    it('applies its style and forwards props', () => {
        render(
            <Textarea
                aria-label="Prompt"
                rows={3}
                className="tall"
                defaultValue="Hello"
            />
        );
        const textarea = screen.getByLabelText('Prompt');
        expect(textarea).toHaveClass(textareaStyles.textarea, 'tall');
        expect(textarea).toHaveAttribute('rows', '3');
        expect(textarea).toHaveValue('Hello');
    });
});

describe('Select', () => {
    it('renders its options with its style', async () => {
        const onChange = vi.fn();
        render(
            <Select
                aria-label="Type"
                className="narrow"
                defaultValue="mcq"
                onChange={onChange}
            >
                <option value="mcq">Multiple choice</option>
                <option value="essay">Essay</option>
            </Select>
        );
        const select = screen.getByLabelText('Type');
        expect(select).toHaveClass(selectStyles.select, 'narrow');
        expect(screen.getAllByRole('option')).toHaveLength(2);

        await userEvent.selectOptions(select, 'essay');
        expect(select).toHaveValue('essay');
        expect(onChange).toHaveBeenCalled();
    });
});

describe('FileInput', () => {
    it('is always a file input', () => {
        render(
            <FileInput
                aria-label="Paper"
                accept="application/pdf"
                className="drop"
            />
        );
        const input = screen.getByLabelText('Paper');
        expect(input).toHaveAttribute('type', 'file');
        expect(input).toHaveAttribute('accept', 'application/pdf');
        expect(input).toHaveClass(fileInputStyles.fileInput, 'drop');
    });
});

describe('Label', () => {
    it('labels the control it points at', () => {
        render(
            <>
                <Label htmlFor="name" className="bold">
                    Full name
                </Label>
                <input id="name" />
            </>
        );
        expect(screen.getByText('Full name')).toHaveClass(
            labelStyles.label,
            'bold'
        );
        expect(screen.getByLabelText('Full name')).toHaveAttribute(
            'id',
            'name'
        );
    });
});

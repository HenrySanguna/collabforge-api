import { IsEmail, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/, {
    message:
      'password must be at least 10 characters and include a lowercase letter, an uppercase letter and a digit',
  })
  password!: string;

  @Length(1, 80)
  name!: string;
}

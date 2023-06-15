import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { HashingService } from '../hashing/hashing.service';
import { SignUpDto } from './dto/sign-up.dto';
import { pgErrorCodes } from 'src/common/pgErrorCodes';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import jwtConfig from 'src/config/jwt.config';
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  InvalidateRefreshTokenError,
  RefreshTokenIdsStorage,
} from './refresh-token-ids.storage';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly refreshTokenIdsStorage: RefreshTokenIdsStorage,
  ) {}

  async signup(signUpDto: SignUpDto) {
    try {
      const user = new User();
      user.email = signUpDto.email;
      user.password = await this.hashingService.hash(signUpDto.password);

      await this.usersRepository.save(user);
    } catch (error) {
      if (error.code === pgErrorCodes.uniqueViolation) {
        throw new ConflictException();
      }
      throw error;
    }
  }

  async signin(signInDto: SignInDto) {
    const found = await this.usersRepository.findOneBy({
      email: signInDto.email,
    });
    if (!found) {
      throw new UnauthorizedException('User does not exist');
    }
    const isMatch = await this.hashingService.compare(
      signInDto.password,
      found.password,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Passwords do not match');
    }
    // TODO: implement jwt etc
    return await this.generateTokens(found);
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    try {
      //    verify active refresh token
      const { sub, refreshTokenId } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'> & { refreshTokenId: string }
      >(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
      const found = await this.usersRepository.findOneByOrFail({ id: sub });

      // validate refreshToken in redis
      const isValid = await this.refreshTokenIdsStorage.validate(
        found.id,
        refreshTokenId,
      );
      // invalidate previous refresh token
      // refresh-token-rotation
      if (isValid) {
        await this.refreshTokenIdsStorage.invalidate(found.id);
      } else {
        throw new Error('Refresh token is invalid');
      }

      return this.generateTokens(found);
    } catch (error) {
      if (error instanceof InvalidateRefreshTokenError) {
        throw new UnauthorizedException('Access Denied');
      }
      throw new UnauthorizedException();
    }
  }

  async generateTokens(found: User) {
    // id to store in redis
    const refreshTokenId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        found.id,
        this.jwtConfiguration.accessTokenTtl,
        { email: found.email, role: found.role },
      ),
      this.signToken(found.id, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
      }),
    ]);
    await this.refreshTokenIdsStorage.insert(found.id, refreshTokenId);
    return { accessToken, refreshToken };
  }

  private async signToken<T>(userId: number, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }
}

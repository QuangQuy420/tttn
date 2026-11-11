package com.tttn.userservice;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class UserServiceApplicationTest {

    @Test
    void parseDurationMillis_bareNumberIsSeconds_AC15() throws Exception {
        // parseDurationMillis is private and only reached from main(); call it directly.
        Method parse = UserServiceApplication.class
                .getDeclaredMethod("parseDurationMillis", String.class);
        parse.setAccessible(true);

        assertThat(parse.invoke(null, "3600")).isEqualTo(3_600_000L);
    }
}
